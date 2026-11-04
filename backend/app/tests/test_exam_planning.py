import random

from app.services.exam_planning import assign_quotas, split_evenly


def test_split_evenly_spreads_the_remainder():
    assert split_evenly(10, 3) == [4, 3, 3]
    assert split_evenly(9, 3) == [3, 3, 3]
    assert split_evenly(11, 3) == [4, 4, 3]
    assert split_evenly(1, 3) == [1, 0, 0]


def test_equal_split_when_divisible():
    assert assign_quotas(9, [10, 10, 10], random.Random(1)) == [3, 3, 3]


def test_the_remainder_goes_only_to_subjects_that_can_take_it():
    for seed in range(20):
        quotas = assign_quotas(10, [3, 10, 10], random.Random(seed))
        assert quotas is not None
        assert sum(quotas) == 10
        assert quotas[0] == 3  # this subject only has 3 questions, so it cannot take the extra one
        assert max(quotas) - min(quotas) <= 1


def test_the_extra_question_is_not_always_taken_from_the_same_subject():
    seen = {tuple(assign_quotas(10, [10, 10, 10], random.Random(seed))) for seed in range(40)}
    assert {(4, 3, 3), (3, 4, 3), (3, 3, 4)} <= seen


def test_the_split_is_refused_when_a_subject_is_short():
    assert assign_quotas(9, [2, 10, 10], random.Random(1)) is None  # needs 3 each, one has only 2
    assert assign_quotas(11, [3, 3, 10], random.Random(1)) is None  # two subjects must give 4, only one can


def test_small_counts_use_only_subjects_that_have_questions():
    assert assign_quotas(2, [0, 5, 5], random.Random(3)) == [0, 1, 1]
    assert assign_quotas(1, [0, 0, 0], random.Random(3)) is None


def test_nothing_to_split():
    assert assign_quotas(5, [], random.Random(1)) is None
    assert assign_quotas(0, [5, 5], random.Random(1)) is None