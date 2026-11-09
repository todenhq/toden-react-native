import { useCallback, useEffect, useMemo, useState } from 'react';

import { useFlowState, useVerificationConfig, useVerificationStore } from '../../components/runtime';
import { addressFlowFor } from '../../config/addressCollection';
import { webViewAvailable } from '../../lib/webview-available';
import { isBusinessFlow } from '../../config/business';
import { addressFlowSteps, addressVendorsStubbed, firstAddressCaptureStep } from '../../lib/address-flow';
import { addressBookOffer } from '../../lib/address-book';
import { addressExitStep } from '../../lib/address-step-recovery';
import { useRecoverAddressStep } from './use-recover-address-step';
import { defaultMapView } from '../../lib/map-tiles';
import { buildStepOrder, nextStepInOrder } from '../../config/stepOrder';
import { geoDefaultCountry } from '../../lib/country-adoption';
import { configScope, isScopedBusiness } from '../../lib/scope';
import { stepOrderOptions } from '../../store/verificationStore';
import { deviceFixFields } from '../../services/location';
import { savePresencePin } from '../../presence/store';
import { usePinActions } from './use-pin-actions';
import type { VerificationStep } from '../../types/config';
import type { AddressState } from '../../store/state';

// ---------------------------------------------------------------------------
// The address flow's shared brain: every address step mounts this hook and gets
// the same derived flags, the same step list, and the same actions — which is
// what keeps four separate screens telling one story.
//
// Navigation rides the SDK's ONE ordered step list rather than a second copy:
// the flow's steps are already in `buildStepOrder`, so stepping forward, going
// back, and backing out of the flow entirely all fall out of the same list the
// progress bar reads. That is why nothing here reimplements goBack — the
// sheet's own back button already walks it — and why goNext is the store's
// nextStep. `nextAddressStep`/`prevAddressStep` stay in lib/address-flow as
// part of the pure mirror the three SDKs share.
//
// A MIRROR of the web SDK's steps/address/use-address-flow.ts.
// ---------------------------------------------------------------------------

export function useAddressFlow() {
  const config = useVerificationConfig();
  const store = useVerificationStore();
  const address = useFlowState((s) => s.address);
  const serverSearch = useFlowState((s) => s.serverConfig.addressSearch === true);
  const selectedCountry = useFlowState((s) => s.selectedCountry);
  const businessCountry = useFlowState((s) => s.business.country);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cfg = config.addressCollection;
  // The KYB application's premises step (its country is the register's) vs
  // the wording: a scoped business address check reads "the premises" too,
  // but runs the address scope's own steps and declared country.
  const kybPremises = isBusinessFlow(config);
  const isBusiness = kybPremises || isScopedBusiness(config);
  const vendorEnvironment = useFlowState((s) => s.serverConfig.environment ?? null);
  const mapsFrameUrl = useFlowState((s) => s.serverConfig.mapsFrameUrl ?? null);
  const serverConfig = useFlowState((s) => s.serverConfig);
  const bookOffer = addressBookOffer({ ...config, serverConfig });
  const flow = addressFlowFor(
    config,
    serverSearch,
    addressVendorsStubbed({ environment: vendorEnvironment }),
    Boolean(mapsFrameUrl) && webViewAvailable(),
  );
  // Memoised on the three flags it derives from, so `steps` — and the two
  // navigation callbacks that close over it — keep a stable identity. A fresh
  // array on every render would make `goNext` a new function each time, and
  // the entrance step depends on that identity inside an effect.
  const { searchAvailable, photoMode, streetViewOffered } = flow;
  const steps: VerificationStep[] = useMemo(
    () => addressFlowSteps({ searchAvailable, photoMode, streetViewOffered }),
    [searchAvailable, photoMode, streetViewOffered],
  );
  // The presence primer's home.
  const firstCaptureStep = firstAddressCaptureStep(steps) ?? steps[0]!;

  useRecoverAddressStep(store);

  // The address scope declares the visitor's IP country by default, ONCE,
  // while nothing is declared; a geocode or a picked address then corrects
  // the guess (lib/country-adoption.ts). A full flow never defaults from it.
  const geoCountry = useFlowState((s) => s.serverConfig.geoCountry ?? null);
  useEffect(() => {
    const s = store.getState();
    const country = geoDefaultCountry({
      geoCountry,
      selectedCountry: s.selectedCountry,
      scope: configScope(s.config),
      accepted: s.config.proofOfAddress?.countries,
    });
    if (country) s.setCountryAuto(country);
  }, [geoCountry, store]);

  const pin = address ? { lat: address.lat, lng: address.lng } : null;
  const country = kybPremises ? (businessCountry ?? undefined) : (selectedCountry ?? config.country);
  const view = defaultMapView(country);

  const pinActions = usePinActions(store, setError);

  /** Leave the address flow forwards (after the review, a KYB commit, a skip,
   *  a picked saved address), read off the CURRENT order: a picked saved
   *  address drops the capture steps. */
  const exitForward = useCallback(() => {
    const state = store.getState();
    const order = buildStepOrder(stepOrderOptions(state));
    const exit = addressExitStep(order);
    store.getState().goToStep(exit ?? nextStepInOrder(steps[steps.length - 1]!, stepOrderOptions(state)));
  }, [steps, store]);

  /**
   * The step after the current one within the flow, else the flow's exit:
   * exactly what the store's own `nextStep` computes, since the flow's steps
   * are contiguous in the ordered list. Going through the store also keeps
   * the navigation direction and the camera flag handled in one place.
   */
  const goNext = useCallback(() => store.getState().nextStep(), [store]);

  const pickPhoto = useCallback(
    async (upload: () => Promise<string>, previewUri: string) => {
      setError(null);
      setUploading(true);
      try {
        const mediaId = await upload();
        store.getState().setAddressPhoto(mediaId);
        store.getState().setAddressPhotoPreview(previewUri);
      } catch (err) {
        setError(
          err instanceof Error && err.message
            ? err.message
            : 'Upload failed. Please check your connection and try again.',
        );
      } finally {
        setUploading(false);
      }
    },
    [store],
  );

  const removePhoto = useCallback(() => {
    store.getState().setAddressPhoto(null);
    store.getState().setAddressPhotoPreview(null);
  }, [store]);

  /** Commit: the one-shot attest fix (best-effort), then leave the flow. */
  const confirm = useCallback(async () => {
    const current = store.getState().address;
    if (!current) return;
    setConfirming(true);
    let committed: AddressState = current;
    if (cfg?.attestPresence) {
      // Best-effort by contract: a denied prompt or a slow read costs the
      // `attested` tier, never the flow.
      committed = { ...current, ...(await deviceFixFields()) };
      store.getState().setAddress(committed);
    }
    // Presence verification keeps the confirmed pin ON-DEVICE so later
    // foreground reports evaluate the fence locally. Keyed by the org's user
    // reference: without one there is nothing to report against.
    if (cfg?.presence?.enabled === true && config.userId) {
      savePresencePin(
        config.userId,
        { lat: committed.lat, lng: committed.lng },
        {
          alwaysOn: cfg.presence.alwaysOn === true,
          background: cfg.presence.background !== false,
          playIntegrityProject: serverConfig.playIntegrityCloudProjectNumber ?? null,
        },
      );
    }
    setConfirming(false);
    exitForward();
  }, [
    cfg?.attestPresence,
    cfg?.presence?.enabled,
    config.userId,
    exitForward,
    serverConfig.playIntegrityCloudProjectNumber,
    store,
  ]);

  return {
    cfg,
    address,
    isBusiness,
    steps,
    firstCaptureStep,
    bookOffer,
    pin,
    view,
    country,
    photoMode: flow.photoMode,
    streetViewOffered: flow.streetViewOffered,
    searchAvailable: flow.searchAvailable,
    uploading,
    confirming,
    error,
    setError,
    pickPhoto,
    removePhoto,
    goNext,
    exitForward,
    confirm,
    ...pinActions,
  };
}
