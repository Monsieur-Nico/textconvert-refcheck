/**
 * Blanks out fenced code blocks (```...```) and inline code spans
 * (`...`, `` ...`... ``, etc., matching CommonMark's rule that an
 * N-backtick-delimited span closes at the next run of exactly N
 * backticks) from `text`, replacing their content with spaces.
 *
 * Applied once, before any of this Action's extraction passes run, so a
 * markdown code example showing command syntax (e.g. Dependabot's own PR
 * template text ``@dependabot rebase``) is never mistaken for a real
 * mention or reference -- content inside a code span is meant to be
 * read literally, not interpreted as live markdown.
 *
 * Preserves the text's overall length and line structure (newlines are
 * never blanked), so positions found in the result still line up with
 * the original text.
 */
export function maskCode(text: string): string {
  const chars = text.split('');
  const length = chars.length;
  let i = 0;

  const blank = (start: number, end: number) => {
    for (let j = start; j < end; j++) {
      if (chars[j] !== '\n') chars[j] = ' ';
    }
  };

  while (i < length) {
    if (text.startsWith('```', i)) {
      const closeIndex = text.indexOf('```', i + 3);
      const end = closeIndex === -1 ? length : closeIndex + 3;
      blank(i, end);
      i = end;
      continue;
    }

    if (chars[i] === '`') {
      let runLength = 1;
      while (i + runLength < length && chars[i + runLength] === '`') runLength++;

      const fence = '`'.repeat(runLength);
      const closeIndex = text.indexOf(fence, i + runLength);
      const end = closeIndex === -1 ? length : closeIndex + runLength;
      blank(i, end);
      i = end;
      continue;
    }

    i++;
  }

  return chars.join('');
}
