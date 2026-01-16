export class IdGenerator {
    static generate(): string {
        return crypto.randomUUID();
    }
}
