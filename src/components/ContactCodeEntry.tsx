import React, { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { radius, spacing } from '../config/theme';
import { useTheme } from './runtime';
import { UiText } from './Typography';
import { Icon } from './Icon';
import { UiInput } from './UiInput';
import { otpCodeFrom, pastedCode } from '../lib/otp-code';
import type { OtpInputStyle } from '../types/workflow';
import { useText } from '../i18n/useText';

// ---------------------------------------------------------------------------
// The OTP code field.
//
// Which one renders — segmented boxes or a plain field — is the ORG's choice in
// the workflow builder (`inputStyle`), not the end user's.
//
// The segmented version is ONE hidden TextInput with boxes drawn over it, not
// N inputs with focus-juggling between them. That is what makes SMS autofill
// work (the platform fills a single field), makes paste work, and makes
// backspace behave — a per-box implementation breaks all three, and they are
// the three things people actually do with a code.
//
// Neither field carries a maxLength: it cuts a paste before anybody reads it, so
// "Your code is 123456" arrived as "Your c". The length is applied to the digits
// (lib/otp-code.ts). A number pad has no paste key, so Paste code sits beside it.
// ---------------------------------------------------------------------------

export function ContactCodeEntry({
  code,
  onChange,
  codeLength,
  style,
  disabled,
  onComplete,
  pasteColor,
}: {
  code: string;
  onChange: (code: string) => void;
  codeLength: number;
  /** Config-driven field style ('segmented' default). */
  style: OtpInputStyle;
  disabled?: boolean;
  /** Fires with the full code once the last slot fills (auto-submit). */
  onComplete?: (code: string) => void;
  /** The Paste code link, where the entry sits on a glass sheet. */
  pasteColor?: string;
}): React.ReactElement {
  const t = useText();
  const { colors } = useTheme();
  const [noCode, setNoCode] = useState(false);
  const apply = (next: string): void => {
    setNoCode(false);
    onChange(next);
    if (next.length === codeLength) onComplete?.(next);
  };
  const handle = (raw: string): void => apply(otpCodeFrom(raw, code, codeLength));
  const paste = async (): Promise<void> => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    const next = pastedCode(text, codeLength);
    if (next) apply(next);
    else setNoCode(true);
  };
  const pasteLink = (
    <View style={{ alignItems: 'center', marginTop: spacing.sm }}>
      <Pressable
        onPress={() => void paste()}
        disabled={disabled}
        accessibilityRole="button"
        hitSlop={8}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          minHeight: 44,
          paddingHorizontal: spacing.sm,
          opacity: disabled ? 0.5 : pressed ? 0.6 : 1,
        })}
      >
        <Icon name="copy" size={16} color={pasteColor ?? colors.primary} />
        <UiText variant="label" color={pasteColor ?? colors.primary}>
          {t('contact.code.paste')}
        </UiText>
      </Pressable>
      {noCode ? (
        <UiText variant="bodySmall" color={colors.error} accessibilityRole="alert" style={{ textAlign: 'center' }}>
          {t('contact.code.pasteNone')}
        </UiText>
      ) : null}
    </View>
  );

  if (style === 'text') {
    return (
      <View>
        <UiInput
          label={t('contact.code.label')}
          value={code}
          onChangeText={handle}
          placeholder={'0'.repeat(codeLength)}
          keyboardType="number-pad"
          editable={!disabled}
          autoFocus
        />
        {pasteLink}
      </View>
    );
  }

  return (
    <View>
      <SegmentedCode code={code} onChangeText={handle} codeLength={codeLength} disabled={disabled} />
      {pasteLink}
    </View>
  );
}

function SegmentedCode({
  code,
  onChangeText,
  codeLength,
  disabled,
}: {
  code: string;
  onChangeText: (raw: string) => void;
  codeLength: number;
  disabled?: boolean;
}): React.ReactElement {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);

  return (
    <View>
      {/* Boxes flex to fill the width at a fixed aspect ratio, and the FILLED
          ones carry the primary border — same geometry and same signal as the
          Flutter SDK's OtpInput, so the step reads identically on both. */}
      <Pressable
        onPress={() => inputRef.current?.focus()}
        accessibilityRole="none"
        style={{ flexDirection: 'row', gap: spacing.xs }}
      >
        {Array.from({ length: codeLength }, (_, i) => {
          const filled = i < code.length;
          return (
            <View
              key={i}
              style={{
                flex: 1,
                aspectRatio: 0.82,
                borderRadius: radius.md,
                borderWidth: filled ? 1.5 : 1,
                borderColor: filled ? colors.primary : colors.border,
                backgroundColor: colors.background,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <UiText variant="heading2">{code[i] ?? ''}</UiText>
            </View>
          );
        })}
      </Pressable>

      {/* One real input behind the boxes: the platform's SMS autofill targets a
          single field, and paste/backspace only behave against one value. It is
          positioned over the boxes (not display:none) because a zero-size or
          hidden input is skipped by autofill on both platforms. The caret is
          tinted away rather than caretHidden, which takes iOS's Paste menu
          with it. */}
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={onChangeText}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        editable={!disabled}
        autoFocus
        selectionColor="transparent"
        cursorColor="transparent"
        accessibilityLabel="Verification code"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0.01,
          color: 'transparent',
          textAlign: 'center',
        }}
      />
    </View>
  );
}
