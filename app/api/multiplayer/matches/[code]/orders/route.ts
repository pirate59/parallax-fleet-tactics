import { submitMultiplayerOrders } from "../../../../../../db/multiplayer.ts";
import {
  assertSameOrigin,
  bearerToken,
  multiplayerError,
  multiplayerJson,
  requestBody,
} from "../../../_response.ts";

export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    assertSameOrigin(request);
    const { code } = await context.params;
    const body = await requestBody(request);
    return multiplayerJson(await submitMultiplayerOrders(code, bearerToken(request), body.turn, body.orders, body.controls));
  } catch (error) {
    return multiplayerError(error);
  }
}
