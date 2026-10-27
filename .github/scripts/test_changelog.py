"""Tests for changelog.py. Run: python3 -m unittest discover -s .github/scripts"""

import unittest

from changelog import reflow


class ReflowTest(unittest.TestCase):
    def test_joins_a_wrapped_bullet(self):
        self.assertEqual(
            reflow('- First line of a bullet\n  that continues here\n  and here.'),
            '- First line of a bullet that continues here and here.',
        )

    def test_keeps_one_bullet_per_line(self):
        self.assertEqual(reflow('- one\n- two\n  wrapped\n- three'), '- one\n- two wrapped\n- three')

    def test_keeps_headings_and_blank_lines(self):
        text = '### Added\n\n- a\n  b\n\n### Fixed\n\n- c'
        self.assertEqual(reflow(text), '### Added\n\n- a b\n\n### Fixed\n\n- c')

    def test_joins_paragraph_lines(self):
        self.assertEqual(reflow('Initial release of a\ntool.\n\nSecond paragraph.'), 'Initial release of a tool.\n\nSecond paragraph.')

    def test_nested_bullets_stay_separate_and_join_their_own_wraps(self):
        text = '- parent\n  - child one\n    wrapped\n  - child two'
        self.assertEqual(reflow(text), '- parent\n  - child one wrapped\n  - child two')

    def test_leaves_code_fences_alone(self):
        text = '- run this:\n\n```bash\nnpm run a \\\n  && npm run b\n```\n\n- next\n  wrapped'
        self.assertEqual(reflow(text), '- run this:\n\n```bash\nnpm run a \\\n  && npm run b\n```\n\n- next wrapped')

    def test_leaves_tables_quotes_and_link_references_alone(self):
        text = '| a | b |\n| - | - |\n\n> quoted\n> more\n\n[1.0.0]: https://example.com/a'
        self.assertEqual(reflow(text), text)

    def test_hard_break_is_kept(self):
        self.assertEqual(reflow('- first  \n  second\n  third'), '- first  \n  second third')

    def test_backticks_and_text_are_untouched(self):
        self.assertEqual(reflow('- uses `--club`\n  and `a  b`'), '- uses `--club` and `a  b`')

    def test_already_single_line_text_is_unchanged(self):
        text = '### Fixed\n\n- one line\n- another line'
        self.assertEqual(reflow(text), text)


if __name__ == '__main__':
    unittest.main()
