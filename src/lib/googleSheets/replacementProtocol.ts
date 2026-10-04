export type ReplacementPorts<Candidate, Verified> = {
  prepare: () => Promise<Candidate>;
  verify: (candidate: Candidate) => Promise<Verified>;
  activate: (candidate: Candidate, verified: Verified) => Promise<void>;
  retirePrevious: (candidate: Candidate) => Promise<void>;
  recordFailedCandidate: (candidate: Candidate, error: unknown) => Promise<void>;
};

export async function runReplacementProtocol<Candidate, Verified>(ports: ReplacementPorts<Candidate, Verified>) {
  const candidate = await ports.prepare();
  try {
    const verified = await ports.verify(candidate);
    await ports.activate(candidate, verified);
  } catch (error) {
    await ports.recordFailedCandidate(candidate, error);
    throw error;
  }
  let cleanupPending = false;
  try { await ports.retirePrevious(candidate); }
  catch { cleanupPending = true; }
  return { candidate, cleanupPending };
}
