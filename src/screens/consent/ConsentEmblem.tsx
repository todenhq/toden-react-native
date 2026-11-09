import React, { useState } from 'react';
import { Image, View } from 'react-native';

import { useFlowState, useTheme } from '../../components/runtime';
import { Icon } from '../../components/Icon';
import { TODEN_ACCENT, TODEN_ACCENT_ON_DARK, TodenMark } from '../../components/TodenWordmark';
import { useBranding } from '../../components/useBranding';
import { brandMarkColor, brandMarkIsLight } from '../../config/brand';
import { needsProcessorDisclosure } from '../../lib/trust-attribution';

// ---------------------------------------------------------------------------
// The mark over the consent title: Toden's split shield on a plain muted
// square, in the colours the footer draws it in (components/PoweredBy.tsx):
// the ink chosen for the sheet's background, the right half Toden's purple, a
// step lighter when the ink is the light tone. No border, gradient, glow,
// motion or shadow: the words below carry the screen.
//
// Where the organisation's own logo replaces Toden's in the footer (a custom
// attribution), its logo sits on the square instead, never Toden's mark, and
// a shield when it has none. Mirrors the web SDK's steps/ConsentEmblem.tsx.
// ---------------------------------------------------------------------------

export function ConsentEmblem(): React.ReactElement {
  const { colors } = useTheme();
  const { logoUri } = useBranding();
  const [logoFailed, setLogoFailed] = useState(false);
  const whiteLabel = needsProcessorDisclosure(useFlowState((s) => s.serverConfig.branding?.trustAttribution));
  const ink = brandMarkColor(colors.background);
  const accent = brandMarkIsLight(ink) ? TODEN_ACCENT_ON_DARK : TODEN_ACCENT;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 64,
        height: 64,
        borderRadius: 20,
        backgroundColor: colors.backgroundSecondary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {!whiteLabel ? (
        <TodenMark size={36} ink={ink} accent={accent} />
      ) : logoUri && !logoFailed ? (
        <Image source={{ uri: logoUri }} style={{ width: 36, height: 36 }} resizeMode="contain" onError={() => setLogoFailed(true)} />
      ) : (
        <Icon name="shield" size={32} color={colors.primary} />
      )}
    </View>
  );
}
