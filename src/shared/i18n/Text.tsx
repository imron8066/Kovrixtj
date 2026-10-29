import React from 'react';
import { Text as NativeText } from 'react-native';
import { t } from '.';

const each = (child: React.ReactNode) =>
  typeof child === 'string' ? t(child) : child;

// Text из react-native, но с переводом (src/shared/i18n): весь текст
// приложения выводится через него. Строка из кусков («Был в сети: »
// и дата) переводится целиком.
export function Text({
  children,
  ...props
}: React.ComponentProps<typeof NativeText>) {
  if (Array.isArray(children)) {
    const plain = children.every(
      c => typeof c === 'string' || typeof c === 'number',
    );
    return React.createElement(
      NativeText,
      props,
      ...(plain ? [t(children.join(''))] : children.map(each)),
    );
  }
  return <NativeText {...props}>{each(children)}</NativeText>;
}
