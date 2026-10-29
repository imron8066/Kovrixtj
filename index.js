/**
 * @format
 */

import { AppRegistry } from 'react-native';
import AdminApp from './src/admin/AdminApp';
import UserApp from './src/user/UserApp';

// Два приложения из одного проекта. Какое из них запустить, решает
// сборка: вариант user открывает Donix, вариант admin — DonixAdmin
// (android/app/build.gradle → productFlavors).
AppRegistry.registerComponent('Donix', () => UserApp);
AppRegistry.registerComponent('DonixAdmin', () => AdminApp);
