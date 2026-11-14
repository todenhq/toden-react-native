// The keyboard a code field asks for. Digits only (the default) keeps the number
// pad and nothing else, exactly as before. An alphanumeric code (the workflow's
// `alphanumericCode`) needs letters: the default keyboard, capitalising, and no
// autocorrect, which would rewrite a code into a word. Mirrors the web SDK's
// codeFieldProps and the Flutter SDK's OtpKeyboard.

export type OtpKeyboard =
  | { keyboardType: 'number-pad' }
  | { keyboardType: 'default'; autoCapitalize: 'characters'; autoCorrect: false };

export function otpKeyboard(alphanumeric: boolean): OtpKeyboard {
  return alphanumeric
    ? { keyboardType: 'default', autoCapitalize: 'characters', autoCorrect: false }
    : { keyboardType: 'number-pad' };
}
