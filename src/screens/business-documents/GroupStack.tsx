import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, View } from 'react-native';

import { groupUpload, type BusinessDocumentGroup } from '../../config/businessDocumentGroups';
import { GroupEnter, type GroupDirection } from './GroupEnter';
import { GroupPanel } from './GroupPanel';
import { GroupEdge, GroupRow } from './GroupRow';
import { BUSINESS_DOCUMENTS_COPY as COPY } from './copy';
import type { GroupSlot, GroupUpload } from './useGroupUpload';

// ---------------------------------------------------------------------------
// The groups as a vertical carousel: the open group's card in front, the next
// group's card tucked behind it at the top and the previous group's at the
// bottom (press it to change it), with a thin edge beyond each when there are
// more groups that way. Continue brings the next card down into the middle;
// Back brings the previous one up. Nothing moves on first render. The group
// that has just opened is announced. Mirrors the web SDK's GroupStack.
// ---------------------------------------------------------------------------

export function GroupStack({
  groups,
  active,
  docs,
  onOpen,
  onPick,
}: {
  groups: BusinessDocumentGroup[];
  active: number;
  docs: GroupUpload;
  onOpen: (index: number) => void;
  onPick: (slot: GroupSlot) => void;
}): React.ReactElement | null {
  // Which way the last move went, worked out when `active` changes (null until
  // the first move, so the step's own entrance is not doubled). Back is the
  // sheet's, so the direction is read off the index, not the press.
  const shown = useRef(active);
  const direction = useRef<GroupDirection>(null);
  if (shown.current !== active) {
    direction.current = active > shown.current ? 'forward' : 'back';
    shown.current = active;
  }

  const announced = useRef(active);
  useEffect(() => {
    if (announced.current === active) return;
    announced.current = active;
    const opened = groups[active];
    if (opened) AccessibilityInfo.announceForAccessibility(COPY.opened(active + 1, groups.length, opened.title));
  }, [active, groups]);

  const group = groups[active];
  const previous = groups[active - 1];
  const next = groups[active + 1];
  if (!group) return null;
  const motion = direction.current;

  return (
    <View>
      <GroupEnter key={`ahead-${active}`} direction={motion} fadeOnly>
        {groups[active + 2] ? <GroupEdge side="top" /> : null}
        {next ? <GroupRow group={next} number={active + 2} fileName={null} /> : null}
      </GroupEnter>
      {/* In front of both tucked cards (elevation orders siblings on Android). */}
      <GroupEnter key={group.key} direction={motion} style={{ zIndex: 2, elevation: 3 }}>
        <GroupPanel group={group} number={active + 1} total={groups.length} docs={docs} onPick={onPick} />
      </GroupEnter>
      <GroupEnter key={`behind-${active}`} direction={motion} fadeOnly>
        {previous ? (
          <GroupRow
            group={previous}
            number={active}
            // '' rather than null when restored without a name: it is uploaded, not skipped.
            fileName={(() => {
              const upload = groupUpload(previous, docs.uploads);
              return upload ? (upload.fileName ?? '') : null;
            })()}
            onOpen={() => onOpen(active - 1)}
          />
        ) : null}
        {groups[active - 2] ? <GroupEdge side="bottom" /> : null}
      </GroupEnter>
    </View>
  );
}
