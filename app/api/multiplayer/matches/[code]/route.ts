import { readMultiplayerMatch } from "../../../../../db/multiplayer.ts";
import { bearerToken, multiplayerError, multiplayerJson } from "../../_response.ts";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    return multiplayerJson(await readMultiplayerMatch(code, bearerToken(request)));
  } catch (error) {
    return multiplayerError(error);
  }
}
