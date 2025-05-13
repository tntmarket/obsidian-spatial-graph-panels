export function assumeExists<T>(x: T | null): T {
    if (!x) {
        throw new Error('Expected value to exist');
    }
    return x;
}
