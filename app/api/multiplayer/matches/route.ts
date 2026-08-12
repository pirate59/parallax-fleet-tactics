import { createMultiplayerMatch } from "../../../../db/multiplayer.ts";
import { assertSameOrigin, multiplayerError, multiplayerJson, requestBody } from "../_response.ts";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await requestBody(request);
    return multiplayerJson(await createMultiplayerMatch(body.name, body.fleet, body.settings), 201);
  } catch (error) {
    return multiplayerError(error);
  }
}
