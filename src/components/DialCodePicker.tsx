import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { spacing } from '../config/theme';
import { useTheme } from './runtime';
import { UiText } from './Typography';
import { Icon } from './Icon';
import { useInputFontFamily } from './fonts';
import { FloatingSheet } from './glass/FloatingSheet';
import { DialCodeDivider, DialCodeRegionHeader, DialCodeRow } from './DialCodeRow';
import { buildDialCodeItems, dialCodeItemKey, filterDialCodeOptions, type DialCodeItem } from './dialCodeRows';

// ---------------------------------------------------------------------------
// THE country sheet — the phone field's dial-code picker, generalised.
//
// A dedicated searchable sheet rather than UiSelect: that control renders
// every option in a ScrollView, which is fine for four document kinds and
// unusable for ~240 countries. A FlatList keeps the list smooth on a low-end
// Android device. `dialCode` is optional: with it this is the phone picker,
// without it a plain country picker (the key-people "where their ID was
// issued" field) — SAME sheet, SAME search, so the two feel identical.
//
// Laid out as the web sheet (CountrySummarySelect) is: a borderless search
// row ruled off underneath, then flag / country name / dial code in rounded
// rows, with the selected row filled rather than ticked. Flutter's
// showDialCodePicker is drawn the same.
//
// The sheet is sized against the space left ABOVE the keyboard, like Flutter's.
// The search field autofocuses, so measuring against the full screen would put
// every result underneath the keys the moment the user started typing.
//
// `grouped` lists the countries under region headers (Africa first), the way
// the country-select step does — what the address-scope country control asks
// for. The list itself is built by dialCodeRows.ts.
// ---------------------------------------------------------------------------

export interface DialCodeOption {
  code: string;
  name: string;
  /** Absent ⇒ a plain country picker: no trailing code, name/ISO search only. */
  dialCode?: string;
}

export function DialCodePicker({
  visible,
  options,
  selected,
  pinned,
  grouped = false,
  onPick,
  onClose,
  searchPlaceholder = 'Search country or code',
  selectedTag,
  geoTag = 'Your location',
  emptyText = 'No countries match your search.',
  title,
}: {
  visible: boolean;
  options: DialCodeOption[];
  selected: string;
  /**
   * The visitor's IP country. Lifted out of the alphabet to the top and
   * tagged, so a guess we made on their behalf is visible AS a guess and one
   * tap away rather than buried among two hundred others.
   */
  pinned?: string | null;
  /** Region headers between the rows (the pinned row stays on top). */
  grouped?: boolean;
  onPick: (code: string) => void;
  onClose: () => void;
  searchPlaceholder?: string;
  /**
   * The current answer pinned on top too, tagged (the country summary row's
   * "Selected"), above the geo row. Absent = the current answer stays in its
   * place, only tinted.
   */
  selectedTag?: string;
  /** The geo row's tag. */
  geoTag?: string;
  /** What an empty search says. */
  emptyText?: string;
  /** The sheet's title in the house header ("Country code", the field's caption). */
  title?: string;
}): React.ReactElement {
  const { colors } = useTheme();
  const fontFamily = useInputFontFamily();
  const { height: screenHeight } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [keyboard, setKeyboard] = useState(0);

  useEffect(() => {
    // iOS reports 'will' events early enough to resize before the keys land;
    // Android only emits 'did'.
    const show = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hide = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(show, (e) => setKeyboard(e.endCoordinates.height));
    const hidden = Keyboard.addListener(hide, () => setKeyboard(0));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const available = screenHeight - keyboard;
  const maxHeight = Math.min(Math.max(available * 0.85, 240), screenHeight * 0.6);

  // Where they appear to be, lifted out of the alphabet. It stays subject to
  // the search, so typing still narrows to what was asked for rather than
  // keeping a row that does not match.
  const rows = useMemo(
    () =>
      buildDialCodeItems(filterDialCodeOptions(options, query), pinned, grouped, selectedTag ? selected : null),
    [options, query, pinned, grouped, selectedTag, selected],
  );
  // The hairline sits under the LAST pinned row: the geo guess, else the
  // pinned current answer.
  const lastPinned = rows.geo ?? rows.selected;
  const tagOf = (code: string): string | undefined =>
    rows.selected != null && code === rows.selected.code
      ? selectedTag
      : rows.geo != null && code === rows.geo.code
        ? geoTag
        : undefined;

  const close = (): void => {
    setQuery('');
    onClose();
  };

  return (
    <FloatingSheet
      visible={visible}
      onClose={close}
      maxHeight={maxHeight}
      // Ride above a raised keyboard — this sheet's whole job is a search box.
      bottomOffset={keyboard}
      closeLabel="Close country picker"
      title={title}
    >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: 44,
            paddingHorizontal: 12,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
          }}
        >
          <Icon name="search" size={16} color={colors.textSecondary} />
          {/* Deliberately NOT autofocused: springing the keyboard the instant
              the sheet opens hides half the list before the person has even
              seen it — search is one tap away for whoever wants it. */}
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={searchPlaceholder}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={searchPlaceholder}
            autoCorrect={false}
            selectionColor={colors.primary}
            style={{ flex: 1, height: '100%', padding: 0, color: colors.textDark, fontSize: 16, fontFamily }}
          />
          {query ? (
            <Pressable
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear"
              hitSlop={10}
              style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="close" size={14} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        <FlatList
          data={rows.items}
          keyExtractor={dialCodeItemKey}
          keyboardShouldPersistTaps="handled"
          // The web list's p-1.5, and pb-6 so the last row clears the sheet's
          // rounded bottom edge.
          contentContainerStyle={{ padding: 6, paddingBottom: spacing.lg }}
          // A hairline under the pinned row only: the alphabet below it is one
          // list, and a rule between every row is noise.
          ItemSeparatorComponent={({ leadingItem }: { leadingItem: DialCodeItem }) =>
            lastPinned != null && leadingItem.kind === 'row' && leadingItem.option.code === lastPinned.code ? (
              <DialCodeDivider />
            ) : null
          }
          ListEmptyComponent={
            <UiText variant="bodyMedium" style={{ padding: spacing.lg, textAlign: 'center' }}>
              {emptyText}
            </UiText>
          }
          renderItem={({ item }) =>
            item.kind === 'header' ? (
              <DialCodeRegionHeader region={item.region} />
            ) : (
              <DialCodeRow
                option={item.option}
                isSelected={item.option.code === selected}
                badge={tagOf(item.option.code)}
                onPress={() => {
                  setQuery('');
                  onPick(item.option.code);
                }}
              />
            )
          }
        />
    </FloatingSheet>
  );
}
