import type { TokenVerifier } from "../../auth/types";

/** Accepts tokens of the form "token-for:<userId>". */
export const fakeTokenVerifier: TokenVerifier = {
  async verify(token) {
    const match = /^token-for:(.+)$/.exec(token);
    return match ? { userId: match[1] } : null;
  },
};
