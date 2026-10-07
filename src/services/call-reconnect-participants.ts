type IdentifiedParticipant = {
  identity: string;
};

/**
 * Keeps the last known participant cards visible while LiveKit restores the
 * room state. Fresh SDK data always takes precedence over a cached card.
 */
export const mergeRemoteParticipantsDuringReconnect = <
  Participant extends IdentifiedParticipant
>(
  activeParticipants: Participant[],
  reconnectingParticipants: Iterable<Participant>,
  preserveReconnectingParticipants: boolean
): Participant[] => {
  if (!preserveReconnectingParticipants) {
    return activeParticipants;
  }

  const activeParticipantIds = new Set(
    activeParticipants.map(participant => participant.identity)
  );

  return [
    ...activeParticipants,
    ...Array.from(reconnectingParticipants).filter(
      participant => !activeParticipantIds.has(participant.identity)
    )
  ];
};
