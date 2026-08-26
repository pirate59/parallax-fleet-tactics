import { concedeMultiplayerMatch } from "../../../../../../db/multiplayer.ts";
import { assertSameOrigin, bearerToken, multiplayerError, multiplayerJson } from "../../../_response.ts";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    assertSameOrigin(request);
    const { code } = await context.params;
    return multiplayerJson(await concedeMultiplayerMatch(code, bearerToken(request)));
  } catch (error) {
    return multiplayerError(error);
  }
}
