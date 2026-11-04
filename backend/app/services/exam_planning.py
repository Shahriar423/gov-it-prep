"""Pure helpers for planning which questions an automatic exam uses. No database access."""
import random


def split_evenly(count: int, parts: int) -> list[int]:
    """10 questions over 3 parts -> [4, 3, 3]."""
    base, extra = divmod(count, parts)
    return [base + (1 if i < extra else 0) for i in range(parts)]


def assign_quotas(count: int, available: list[int], rng: random.Random) -> list[int] | None:
    """Splits `count` questions equally across subjects (as evenly as possible).

    `available` is how many approved questions each subject has. The remainder goes to randomly
    chosen subjects that can still afford one more question, so the extra question is not always
    taken from the same subject. Returns the quotas in the same order as `available`, or None
    when an equal split is impossible (a subject has too few questions)."""
    parts = len(available)
    if parts == 0 or count < 1:
        return None

    base, extra = divmod(count, parts)
    if any(a < base for a in available):
        return None

    eligible = [i for i, a in enumerate(available) if a >= base + 1]
    if len(eligible) < extra:
        return None

    chosen = set(rng.sample(eligible, extra))
    return [base + (1 if i in chosen else 0) for i in range(parts)]