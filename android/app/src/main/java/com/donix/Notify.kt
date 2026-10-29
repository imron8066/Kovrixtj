package com.donix

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ViewManager
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import org.json.JSONObject

// Уведомления на телефоне без Firebase Cloud Messaging: телефон сам
// раз в 15 минут (и сразу, пока приложение открыто) смотрит в базу —
// что изменилось в заказах, объявлениях и чатах и не вышла ли новая
// версия — и показывает уведомление. Приложение передаёт сюда, кто
// вошёл (configure), при выходе — clear.

private const val PREFS = "donix_notify"
private const val CHANNEL = "donix"
private const val JOB_ID = 4201

object Notifier {
  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun configure(context: Context, config: JSONObject) {
    val prefs = prefs(context)
    // другой аккаунт — начинаем с чистого листа, без уведомлений о старом
    if (prefs.getString("uid", "") != config.optString("uid")) {
      prefs.edit().remove("seen").apply()
    }
    prefs.edit().putString("config", config.toString()).putString("uid", config.optString("uid")).apply()
    schedule(context)
  }

  fun clear(context: Context) {
    prefs(context).edit().clear().apply()
    context.getSystemService(JobScheduler::class.java)?.cancel(JOB_ID)
  }

  private fun schedule(context: Context) {
    val scheduler = context.getSystemService(JobScheduler::class.java) ?: return
    if (scheduler.getPendingJob(JOB_ID) != null) return
    scheduler.schedule(
      JobInfo.Builder(JOB_ID, ComponentName(context, NotifyJob::class.java))
        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
        .setPeriodic(15 * 60 * 1000L)
        .setPersisted(true)
        .build(),
    )
  }

  private fun http(method: String, url: String, body: String? = null, form: Boolean = false): String {
    val connection = URL(url).openConnection() as HttpURLConnection
    connection.requestMethod = method
    connection.connectTimeout = 15000
    connection.readTimeout = 15000
    if (body != null) {
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", if (form) "application/x-www-form-urlencoded" else "application/json")
      connection.outputStream.use { it.write(body.toByteArray()) }
    }
    val code = connection.responseCode
    val text = (if (code < 400) connection.inputStream else connection.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
    if (code >= 400) throw RuntimeException("$code $text")
    return text
  }

  // Проверка; вызывается из фоновой задачи и из приложения. Никогда не падает.
  @Synchronized
  fun check(context: Context) {
    try {
      run(context)
    } catch (_: Exception) {
      // нет связи или вход устарел — попробуем в следующий раз
    }
  }

  private fun run(context: Context) {
    val prefs = prefs(context)
    val config = JSONObject(prefs.getString("config", null) ?: return)
    val uid = config.getString("uid")
    val apiKey = config.getString("apiKey")
    val base = config.getString("databaseURL").trimEnd('/')
    val staff = config.optBoolean("staff")
    val versionCode = config.optInt("version")
    val texts = config.optJSONObject("texts") ?: JSONObject()
    fun t(key: String, fallback: String) = texts.optString(key, fallback)

    val auth = JSONObject(
      http(
        "POST",
        "https://securetoken.googleapis.com/v1/token?key=$apiKey",
        "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(config.getString("refreshToken"), "UTF-8"),
        form = true,
      ),
    )
    val token = auth.getString("id_token")
    fun get(path: String): Any? {
      val text = http("GET", "$base/$path.json?auth=$token")
      return if (text == "null" || text.isBlank()) null else JSONObject("{\"v\":$text}").get("v")
    }

    // что уже видели: ключ события → его состояние
    val firstRun = !prefs.contains("seen")
    val seen = JSONObject(prefs.getString("seen", "{}"))
    val next = JSONObject()
    val shown = mutableListOf<Pair<String, String>>()
    fun event(key: String, state: String, title: String, text: String) {
      next.put(key, state)
      if (!firstRun && seen.optString(key) != state) shown.add(title to text)
    }

    // ответы по своим заявкам: донат зачислен, аккаунт принят и т. д.
    val kinds = listOf("orders", "listings", "sales", "claims")
    if (!staff) {
      for (kind in kinds) {
        val items = get("$kind/$uid") as? JSONObject ?: continue
        for (key in items.keys()) {
          val item = items.optJSONObject(key) ?: continue
          val status = item.optString("status")
          val name = item.optString("item").ifBlank { item.optString("title") }
          val note = item.optString("note")
          val text = listOf(name, note).filter { it.isNotBlank() }.joinToString(" — ")
          // о новых заявках клиенту сообщать не нужно — их создал он сам
          if (status == "new") {
            next.put("$kind/$key", status)
            continue
          }
          event("$kind/$key", status, t("$kind.$status", defaultTitle(kind, status)), text)
        }
      }
    } else {
      // команде — новые заявки клиентов
      for (kind in kinds) {
        val byUser = get(kind) as? JSONObject ?: continue
        for (user in byUser.keys()) {
          val items = byUser.optJSONObject(user) ?: continue
          for (key in items.keys()) {
            val item = items.optJSONObject(key) ?: continue
            if (item.optString("status") != "new") continue
            val client = item.optJSONObject("client")?.optString("name") ?: ""
            val name = item.optString("item").ifBlank { item.optString("title") }
            event("$kind/$user/$key", "new", t("$kind.staff", staffTitle(kind)), listOf(client, name).filter { it.isNotBlank() }.joinToString(" · "))
          }
        }
      }
    }

    // новые сообщения в чатах — в том числе «Хочу купить аккаунт»
    for (owner in if (staff) listOf(uid, "staff") else listOf(uid)) {
      val chats = get("userChats/$owner") as? JSONObject ?: continue
      for (id in chats.keys()) {
        val chat = chats.optJSONObject(id) ?: continue
        if (!chat.optBoolean("unread")) continue
        val last = chat.optString("last")
        val buy = chat.optString("kind") == "deal" && last.contains("купить")
        event(
          "chat/$owner/$id",
          chat.optLong("updatedAt").toString(),
          if (buy) t("chat.buy", "🛒 Ваш аккаунт хотят купить")
          // команде — кто пишет в поддержку, а не просто «Поддержка»
          else if (owner == "staff") "💬 " + chat.optString("aName").ifBlank { chat.optString("title") }
          else "💬 " + chat.optString("title"),
          last,
        )
      }
    }

    // новая версия приложения
    val version = get("config/version") as? JSONObject
    if (version != null && version.optInt("code") > versionCode) {
      event("version", version.optInt("code").toString(), t("version", "🔄 Вышло обновление Kovrix") + " " + version.optString("name"), t("version.text", "Откройте приложение → Профиль → Обновить."))
    }

    prefs.edit().putString("seen", next.toString()).apply()
    shown.forEachIndexed { index, (title, text) -> show(context, title, text, index) }
  }

  private fun defaultTitle(kind: String, status: String) = when ("$kind.$status") {
    "orders.done" -> "✅ Донат зачислен"
    "orders.rejected" -> "❌ Заказ отклонён"
    "listings.done" -> "✅ Аккаунт на витрине"
    "listings.rejected" -> "❌ Объявление отклонено"
    "listings.sold" -> "💰 Аккаунт продан"
    "sales.done" -> "✅ Продажа подтверждена"
    "sales.rejected" -> "❌ Продажа не подтверждена"
    "claims.done" -> "🏆 Награда за задание"
    "claims.rejected" -> "❌ Задание не засчитано"
    else -> "Kovrix: заявка обновлена"
  }

  private fun staffTitle(kind: String) = when (kind) {
    "orders" -> "🆕 Новый донат"
    "listings" -> "🆕 Аккаунт на проверку"
    "sales" -> "🆕 Продажа на подтверждение"
    else -> "🆕 Задание выполнено"
  }

  private fun show(context: Context, title: String, text: String, index: Int) {
    if (Build.VERSION.SDK_INT >= 33 &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= 26 && manager.getNotificationChannel(CHANNEL) == null) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL, "Kovrix", NotificationManager.IMPORTANCE_HIGH))
    }
    val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
    }
    val tap = open?.let { PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
    val notification = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_donix)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setContentIntent(tap)
      .build()
    NotificationManagerCompat.from(context).notify((System.currentTimeMillis() % 100000).toInt() * 10 + index, notification)
  }
}

class NotifyJob : JobService() {
  override fun onStartJob(params: JobParameters): Boolean {
    Thread {
      Notifier.check(applicationContext)
      jobFinished(params, false)
    }.start()
    return true
  }

  override fun onStopJob(params: JobParameters) = true
}

class NotifyModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "DonixNotify"

  @ReactMethod
  fun configure(config: ReadableMap) {
    val json = JSONObject(config.toHashMap())
    // сразу после настройки — проверка, в том же потоке
    Thread {
      Notifier.configure(context, json)
      Notifier.check(context)
    }.start()
  }

  @ReactMethod
  fun check() {
    Thread { Notifier.check(context) }.start()
  }

  @ReactMethod
  fun clear() {
    Thread { Notifier.clear(context) }.start()
  }
}

class NotifyPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(NotifyModule(context))

  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
