"""Tests for spec.py. Run from the repo root with: python3 -m unittest tools/animate/test_spec.py
(on Windows: py -m unittest tools/animate/test_spec.py)."""

import copy
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import spec as S  # noqa: E402

BASE = {
    'id': 'demo',
    'equipment': {'type': 'dumbbell', 'hold': 'two_hand_cup'},
    'poses': {
        'start': {'upper_arm.*': [-170, 5, 10]},
        'end': {'inherit': 'start', 'forearm.*': [-140, 0, 0]},
    },
    'phases': [{'to': 'end', 'seconds': 2.0}, {'to': 'start', 'seconds': 1.0}],
    'camera': {'azimuth': 180},
    'glow': {'bones': ['upper_arm.*']},
    'variants': {'fault': {'poses': {'start': {'upper_arm.*': [-160, 30, 30]}}}},
}


def spec(**changes):
    s = copy.deepcopy(BASE)
    s.update(changes)
    return s


class SpecTests(unittest.TestCase):
    def test_mirroring_negates_y_and_z(self):
        r = S.resolve(spec(), 'correct')
        self.assertEqual(r['poses']['start']['bones']['upper_arm.L'], [-170, 5, 10])
        self.assertEqual(r['poses']['start']['bones']['upper_arm.R'], [-170, -5, -10])

    def test_loop_length(self):
        r = S.resolve(spec(), 'correct')
        self.assertEqual(r['frames'], 90)

    def test_override_reaches_inheriting_pose(self):
        r = S.resolve(spec(), 'fault')
        self.assertEqual(r['poses']['end']['bones']['upper_arm.L'], [-160, 30, 30])
        self.assertEqual(r['poses']['end']['bones']['forearm.L'], [-140, 0, 0])

    def test_loop_must_close(self):
        with self.assertRaises(S.SpecError):
            S.resolve(spec(phases=[{'to': 'end', 'seconds': 2.0}]), 'correct')

    def test_rejects_misspelt_variant(self):
        with self.assertRaises(S.SpecError):
            S.resolve(spec(variants={'faults': {}}), 'correct')

    def test_rejects_unknown_camera_field(self):
        with self.assertRaises(S.SpecError):
            S.resolve(spec(camera={'azimuth': 180, 'elevaton': 20}), 'correct')

    def test_rejects_unknown_bone(self):
        with self.assertRaises(S.SpecError):
            S.resolve(spec(poses={'start': {'elbow.*': [0, 0, 0]}, 'end': {}}), 'correct')

    def test_rejects_negative_heel_lift(self):
        with self.assertRaises(S.SpecError):
            S.resolve(spec(poses={'start': {}, 'end': {'heel_lift': -5}}), 'correct')

    def test_variant_equipment_override_is_validated(self):
        with self.assertRaises(S.SpecError):
            S.resolve(spec(variants={'fault': {'equipment': {'hold': 'nope'}}}), 'fault')

    def test_shipped_specs_resolve(self):
        paths = S.spec_paths()
        self.assertTrue(paths, 'no specs found')
        for path in paths:
            for v in S.VARIANTS:
                S.resolve(S.load(path), v)

    def test_spec_ids_exist_in_app(self):
        if not S.EXERCISES_TS.exists():
            self.skipTest('mobile/src/domain/exercises.ts not found')
        known = S.exercise_ids(S.EXERCISES_TS)
        for path in S.spec_paths():
            self.assertIn(S.load(path)['id'], known, path.name)


if __name__ == '__main__':
    unittest.main()
