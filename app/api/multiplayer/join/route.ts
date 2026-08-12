import { joinMultiplayerMatch } from "../../../../db/multiplayer.ts";
import { assertSameOrigin, multiplayerError, multiplayerJson, requestBody } from "../_response.ts";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await requestBody(request);
    return multiplayerJson(await joinMultiplayerMatch(String(body.code ?? ""), body.name, body.fleet));
  } catch (error) {
    return multiplayerError(error);
  }
}
