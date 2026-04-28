import { customAlphabet } from "nanoid";

// Exclude confusing characters (0/O, 1/I/L) so codes are easy to read aloud.
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const gen = customAlphabet(alphabet, 5);

export function generateRoomCode(): string {
  return gen();
}
