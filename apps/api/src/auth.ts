import { UnauthorizedException } from '@nestjs/common';
import { TokenVerifier } from 'livekit-server-sdk';

const verifier = new TokenVerifier(
  process.env.LIVEKIT_API_KEY ?? 'devkey',
  process.env.LIVEKIT_API_SECRET ?? 'devsecret-devsecret-devsecret-32chars',
);

export interface RoomIdentity {
  identity: string;
  name: string;
  room: string;
}

/** Authenticates a request with the LiveKit token issued at join time, and checks it is for `room`. */
export async function authenticate(authorization: string | undefined, room: string): Promise<RoomIdentity> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  if (!token) throw new UnauthorizedException('Missing bearer token');
  try {
    const claims = await verifier.verify(token);
    if (claims.video?.room !== room || !claims.sub) throw new Error('wrong room');
    return { identity: claims.sub, name: claims.name || claims.sub, room };
  } catch {
    throw new UnauthorizedException('Invalid or expired token');
  }
}
