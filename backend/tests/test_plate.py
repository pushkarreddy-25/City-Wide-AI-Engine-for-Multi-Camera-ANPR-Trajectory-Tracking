"""Indian licence-plate helper tests (utils.plate)."""
import random

from utils.plate import (
    generate_plate, is_valid_plate, normalize_plate,
    plate_edit_distance, plates_similar,
)


def test_generated_plates_are_always_valid():
    rng = random.Random(1)
    for _ in range(200):
        assert is_valid_plate(generate_plate(rng))


def test_generate_plate_honours_requested_state():
    rng = random.Random(2)
    plate = generate_plate(rng, state="MH")
    assert plate.startswith("MH-")


def test_is_valid_plate_accepts_canonical_format():
    assert is_valid_plate("MH-31-AB-1234")
    assert is_valid_plate("KA-05-C-9999")   # single-letter series is allowed


def test_is_valid_plate_rejects_malformed():
    assert not is_valid_plate("")
    assert not is_valid_plate("MH31AB1234")       # missing separators
    assert not is_valid_plate("M-31-AB-1234")     # one-letter state
    assert not is_valid_plate("MH-31-ABC-1234")   # three-letter series
    assert not is_valid_plate("MH-31-AB-12")       # short number


def test_normalize_plate_uppercases_and_hyphenates():
    assert normalize_plate("  mh 31 ab 1234 ") == "MH-31-AB-1234"
    assert normalize_plate("mh_31_ab_1234") == "MH-31-AB-1234"
    assert normalize_plate("mh--31---ab-1234") == "MH-31-AB-1234"


def test_edit_distance_ignores_hyphens_and_case():
    assert plate_edit_distance("MH-31-AB-1234", "mh31ab1234") == 0


def test_edit_distance_counts_single_substitution():
    # 3 -> 8 is one character edit (a common OCR confusion).
    assert plate_edit_distance("MH-31-AB-1234", "MH-31-AB-1284") == 1


def test_plates_similar_tolerates_one_edit_by_default():
    assert plates_similar("MH-31-AB-1234", "MH-31-AB-1284")
    assert not plates_similar("MH-31-AB-1234", "MH-31-AB-9999")


def test_plates_similar_false_on_empty():
    assert not plates_similar("", "MH-31-AB-1234")
    assert not plates_similar("MH-31-AB-1234", None)
