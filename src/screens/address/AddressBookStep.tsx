import React from 'react';
import { View } from 'react-native';

import { spacing } from '../../config/theme';
import { useVerificationStore } from '../../components/runtime';
import { UiButton } from '../../components/UiButton';
import { useAddressFlow } from './use-address-flow';
import { useAddressBook } from './use-address-book';
import { ChosenAddress } from './AddressBookParts';
import { useText } from '../../i18n/useText';

/**
 * The picked saved address, in place of the capture steps. The person lands
 * here going back from the step after the address: they can carry on, or use a
 * different address, which brings the offer back over the first address step.
 * A MIRROR of the web SDK's steps/address/AddressBookStep.tsx.
 */
export function AddressBookStep(): React.ReactElement | null {
  const t = useText();
  const store = useVerificationStore();
  const flow = useAddressFlow();
  const book = useAddressBook();
  if (!book.chosen) return null;

  const change = (): void => {
    book.restart();
    store.getState().goToStep(flow.firstCaptureStep);
  };
  return (
    <View style={{ gap: spacing.sm + 4 }}>
      <ChosenAddress label={book.chosen.label} area={book.chosen.area} />
      <UiButton label={t('address.book.continue')} onPress={flow.exitForward} />
      <UiButton label={t('address.book.chosen.change')} variant="ghost" onPress={change} />
    </View>
  );
}
