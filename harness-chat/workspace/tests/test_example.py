import unittest


def add(left: int, right: int) -> int:
    return left + right


class ExampleTests(unittest.TestCase):
    def test_adds_integers(self) -> None:
        self.assertEqual(add(2, 3), 5)


if __name__ == "__main__":
    unittest.main()
