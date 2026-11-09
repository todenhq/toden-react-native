import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { UiAlert } from '../components/UiAlert';
import { UiButton } from '../components/UiButton';
import { UiInput } from '../components/UiInput';
import { UiText } from '../components/Typography';
import { useText } from '../i18n/useText';
import { Icon } from '../components/Icon';
import { BusinessSearchResults } from './BusinessSearchResults';
import { useFlowState, useVerificationStore, useTheme } from '../components/runtime';
import type { BusinessSearchHit } from '../services/api';
import { businessSearchRefusal } from '../config/businessSearch';
import { BusinessRegionField, useBusinessRegions } from './BusinessRegionField';

// ─── Finding the company by name, because that is what people know ───────────
//
// A registration number is on a certificate in a drawer; the name is in the
// applicant's head. Asking for the number first turns the very first field
// into a search of their own filing cabinet, which is where KYB applications
// are abandoned.
//
// The search is read-only and free on most registers; where a register charges
// per search the org pays, so the attempt session rides along. Picking a
// result leads to the register check. It fires on an explicit submit, never on keystroke: a
// debounce spends the register's small, uncontracted rate-limit budget on
// every prefix nobody asked for. Sizes and rhythm mirror the web SDK's
// BusinessSearch (12px block gaps, 48px input/button) — keep them in lockstep.

type SearchState =
  | { phase: 'idle' }
  | { phase: 'searching' }
  | { phase: 'results'; hits: BusinessSearchHit[]; truncated: boolean }
  | { phase: 'unavailable' };

export function BusinessSearch({
  country,
  onPicked,
  onManualEntry,
  onRefused,
}: {
  country: string;
  onPicked: (hit: BusinessSearchHit) => void;
  onManualEntry: () => void;
  /** The server refused search by name for this attempt (its message, or
   *  null): the step moves to registration-number entry. */
  onRefused: (message: string | null) => void;
}): React.ReactElement {
  const store = useVerificationStore();
  const { colors } = useTheme();
  const t = useText();
  const region = useFlowState((s) => s.business.subdivisionCode);
  const sessionId = useFlowState((s) => s.sessionId);
  const [query, setQuery] = useState('');
  // Narrows what came back; it never replaces the search. Matches the name AND
  // the number — a box inviting either that answered only one looked broken.
  const [filter, setFilter] = useState('');
  const [state, setState] = useState<SearchState>({ phase: 'idle' });
  // Four countries file companies per state or emirate, and the provider
  // searches ONE register at a time. Without the region it fails closed —
  // a company filed a state away would otherwise come back "not registered".
  const regions = useBusinessRegions(country);

  const run = async (): Promise<void> => {
    const q = query.trim();
    if (q.length < 2) return;
    if (regions.length > 0 && !region) return;
    setState({ phase: 'searching' });
    try {
      const res = await store.getState().api.businessSearch({
        country,
        query: q,
        limit: 50,
        ...(region ? { subdivisionCode: region } : {}),
        sessionId,
      });
      const hits = res.results ?? [];
      setFilter('');
      setState({ phase: 'results', hits, truncated: hits.length >= 50 });
    } catch (err) {
      // Search by name is not coming back for this attempt (switched off, no
      // session, the org cannot pay, too many searches): straight to the number.
      const refusal = businessSearchRefusal(err);
      if (refusal) {
        setState({ phase: 'idle' });
        onRefused(refusal.message);
        return;
      }
      // Deliberately NOT an empty result list. "No matches" reads as "this
      // business is not registered", a claim an outage has not earned.
      setState({ phase: 'unavailable' });
    }
  };

  const searching = state.phase === 'searching';
  const shown =
    state.phase === 'results'
      ? state.hits.filter((h) => {
          const q = filter.trim().toLowerCase();
          if (!q) return true;
          return (
            h.name.toLowerCase().includes(q) || h.registrationNumber.toLowerCase().includes(q)
          );
        })
      : [];

  return (
    <View>
      <BusinessRegionField regions={regions} region={region} />

      {/* No label: the placeholder says it, and the magnifier says what kind
          of field this is — the web SDK's exact arrangement. */}
      <UiInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search by company name"
        autoCorrect={false}
        prefix={<Icon name="search" size={16} color={colors.textMuted} />}
      />
      <View style={{ height: 12 }} />
      {/* The spinner lives IN the button, as on web — a separate spinner row
          pushed the results down and said the same thing twice. */}
      <UiButton
        label={searching ? 'Searching…' : 'Search'}
        leadingIcon={searching ? undefined : 'search'}
        loading={searching}
        onPress={() => void run()}
        disabled={searching || query.trim().length < 2 || (regions.length > 0 && !region)}
      />

      {state.phase === 'results' && state.hits.length > 0 && (
        <BusinessSearchResults
          country={country}
          hits={state.hits}
          shown={shown}
          truncated={state.truncated}
          filter={filter}
          onFilter={setFilter}
          onPicked={onPicked}
        />
      )}

      {state.phase === 'results' && state.hits.length === 0 && (
        <UiText variant="bodyMedium" color={colors.textSecondary} style={{ marginTop: 12 }}>
          Nothing found under that name. Try a shorter version of it, or enter the details
          yourself.
        </UiText>
      )}

      {state.phase === 'unavailable' && (
        <View style={{ marginTop: 12 }}>
          <UiAlert
            variant="warning"
            title="Search is unavailable"
            message="We could not reach the company register just now. Try again, or enter the details yourself and we will check them when you submit."
          />
        </View>
      )}

      {/* Always offered, not only on failure: some companies are not in the
          index at all, and a dead end at the first step ends the application. */}
      <Pressable
        accessibilityRole="button"
        onPress={onManualEntry}
        hitSlop={8}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          marginTop: 12,
        }}
      >
        <Icon name="pencil" size={14} color={colors.textSecondary} />
        <UiText variant="bodyMedium" color={colors.textSecondary} style={{ fontWeight: '500' }}>
          {t('business.search.manualEntry')}
        </UiText>
      </Pressable>
    </View>
  );
}
