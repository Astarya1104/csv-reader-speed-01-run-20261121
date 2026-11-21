// A fast drop-in for csv-reader 1.0.0: the same answers, read with jumps instead
// of one character at a time.
//
// How it reads: the text is scanned once, left to right. A record whose line
// holds no quote and no stray carriage return is split in one go. Any other
// record is read field by field, where an unquoted field is found with one
// native search for the next comma or line break, and a quoted field with one
// native search for the next quote or line break. A field is taken as a slice
// of the text wherever it can be, so no field is ever built a character at a
// time. Line breaks inside quotes still count, and a carriage return inside
// quotes still becomes a line feed, exactly as the reference does.
//
// Error order, line and row of every error, and the short/long row rules all
// follow the reference: an error carries the line its record starts on and
// the record's index in rows (null for the header), short/long row errors are
// added when the record ends, and quote_junk only when the junk after a
// closing quote kept at least one character.

const CC_COMMA = 44;
const CC_QUOTE = 34;
const CC_LF = 10;
const CC_CR = 13;
const CC_BOM = 0xfeff;

// end of a field: 0 at a comma, 1 at a line break, 2 at the end of the text
const AT_COMMA = 0;
const AT_BREAK = 1;
const AT_END = 2;

export function run(input) {
  const text = String(input.text);
  const wantHeader = input.header === true;
  const total = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let cursor = 0;
  let lineNo = 1;
  let recLine = 1;
  let recRow = null;
  if (total > 0 && text.charCodeAt(0) === CC_BOM) cursor = 1;

  // The next comma, line feed or carriage return at or after lastIndex.
  const delim = /[,\n\r]/g;
  // The next quote, line feed or carriage return at or after lastIndex.
  const special = /["\n\r]/g;

  // Read one unquoted field starting at `from`, with `head` already in its
  // value. Returns [value, end, pos, added]: end is AT_COMMA, AT_BREAK or
  // AT_END, pos is where the next field starts, added counts the characters
  // kept from the text (a dropped stray carriage return adds nothing). It
  // moves lineNo forward and records every stray carriage return it drops.
  function scanPlain(from, head) {
    let parts = null;
    let scan = from;
    let added = 0;
    for (;;) {
      delim.lastIndex = scan;
      const hit = delim.exec(text);
      if (hit === null) {
        const tail = text.slice(scan);
        const value = parts === null ? head + tail : head + parts.join('') + tail;
        return [value, AT_END, total, added + tail.length];
      }
      const at = hit.index;
      const code = text.charCodeAt(at);
      if (code === CC_COMMA) {
        const tail = text.slice(scan, at);
        const value = parts === null ? head + tail : head + parts.join('') + tail;
        return [value, AT_COMMA, at + 1, added + tail.length];
      }
      if (code === CC_LF) {
        const tail = text.slice(scan, at);
        const value = parts === null ? head + tail : head + parts.join('') + tail;
        lineNo += 1;
        return [value, AT_BREAK, at + 1, added + tail.length];
      }
      if (text.charCodeAt(at + 1) === CC_LF) {
        const tail = text.slice(scan, at);
        const value = parts === null ? head + tail : head + parts.join('') + tail;
        lineNo += 1;
        return [value, AT_BREAK, at + 2, added + tail.length];
      }
      errors.push({ code: 'stray_cr', line: recLine, row: recRow });
      added += at - scan;
      if (parts === null) parts = [text.slice(scan, at)];
      else parts.push(text.slice(scan, at));
      scan = at + 1;
    }
  }

  for (;;) {
    // A line left with no characters is no record.
    while (cursor < total) {
      const c = text.charCodeAt(cursor);
      if (c === CC_LF) {
        cursor += 1;
        lineNo += 1;
      } else if (c === CC_CR && text.charCodeAt(cursor + 1) === CC_LF) {
        cursor += 2;
        lineNo += 1;
      } else break;
    }
    if (cursor >= total) break;

    recLine = lineNo;
    recRow = wantHeader && columns === null ? null : rows.length;

    // A record whose line holds no quote and no stray carriage return: the
    // whole line splits in one go. A quote anywhere before the line break,
    // or a carriage return that is not the break itself, needs the scanner.
    const lineEnd = text.indexOf('\n', cursor);
    const le = lineEnd === -1 ? total : lineEnd;
    const contentEnd = lineEnd !== -1 && le > cursor && text.charCodeAt(le - 1) === CC_CR ? le - 1 : le;
    const quoteAt = text.indexOf('"', cursor);
    const crAt = text.indexOf('\r', cursor);
    let fields;
    let skipped = false;
    if ((quoteAt === -1 || quoteAt >= le) && (crAt === -1 || crAt >= contentEnd)) {
      fields = text.slice(cursor, contentEnd).split(',');
      cursor = lineEnd === -1 ? total : lineEnd + 1;
      lineNo += 1;
    } else {
      fields = [];
      let lastQuoted = false;
      let fEnd;
      do {
        let fValue;
        if (text.charCodeAt(cursor) === CC_QUOTE) {
          lastQuoted = true;
          // A field that opens with a quote runs to the next quote that is
          // not doubled; "" inside it is one quote, and each line break
          // inside it is read as a line feed.
          const openAt = cursor;
          const openLine = lineNo;
          let seg = cursor + 1;
          let qVal = '';
          let closed = false;
          let closeAt = -1;
          for (;;) {
            special.lastIndex = seg;
            const hit = special.exec(text);
            if (hit === null) break;
            const at = hit.index;
            const code = text.charCodeAt(at);
            if (code === CC_QUOTE) {
              if (text.charCodeAt(at + 1) === CC_QUOTE) {
                qVal += text.slice(seg, at) + '"';
                seg = at + 2;
                continue;
              }
              qVal += text.slice(seg, at);
              closeAt = at;
              closed = true;
              break;
            }
            qVal += text.slice(seg, at) + '\n';
            lineNo += 1;
            seg = at + (code === CC_CR && text.charCodeAt(at + 1) === CC_LF ? 2 : 1);
          }
          if (!closed) {
            // The quote never closes: it is a literal character, and the
            // text after it is read again as unquoted.
            cursor = openAt + 1;
            lineNo = openLine;
            errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
            const r = scanPlain(cursor, '"');
            fValue = r[0];
            fEnd = r[1];
            cursor = r[2];
          } else {
            const after = closeAt + 1;
            if (after >= total) {
              cursor = total;
              fEnd = AT_END;
              fValue = qVal;
            } else {
              const ac = text.charCodeAt(after);
              if (ac === CC_COMMA) {
                cursor = after + 1;
                fEnd = AT_COMMA;
                fValue = qVal;
              } else if (ac === CC_LF) {
                cursor = after + 1;
                lineNo += 1;
                fEnd = AT_BREAK;
                fValue = qVal;
              } else if (ac === CC_CR && text.charCodeAt(after + 1) === CC_LF) {
                cursor = after + 2;
                lineNo += 1;
                fEnd = AT_BREAK;
                fValue = qVal;
              } else {
                // What follows the closing quote is appended as it stands,
                // up to the next comma or line break.
                const r = scanPlain(after, qVal);
                if (r[3] > 0) errors.push({ code: 'quote_junk', line: recLine, row: recRow });
                fValue = r[0];
                fEnd = r[1];
                cursor = r[2];
              }
            }
          }
        } else {
          lastQuoted = false;
          // An unquoted field runs to the next comma or line break; a
          // carriage return not followed by a line feed is dropped.
          let parts = null;
          let scan = cursor;
          for (;;) {
            delim.lastIndex = scan;
            const hit = delim.exec(text);
            if (hit === null) {
              fValue = parts === null ? text.slice(cursor) : parts.join('') + text.slice(scan);
              cursor = total;
              fEnd = AT_END;
              break;
            }
            const at = hit.index;
            const code = text.charCodeAt(at);
            if (code === CC_COMMA) {
              fValue = parts === null ? text.slice(cursor, at) : parts.join('') + text.slice(scan, at);
              cursor = at + 1;
              fEnd = AT_COMMA;
              break;
            }
            if (code === CC_LF) {
              fValue = parts === null ? text.slice(cursor, at) : parts.join('') + text.slice(scan, at);
              cursor = at + 1;
              lineNo += 1;
              fEnd = AT_BREAK;
              break;
            }
            if (text.charCodeAt(at + 1) === CC_LF) {
              fValue = parts === null ? text.slice(cursor, at) : parts.join('') + text.slice(scan, at);
              cursor = at + 2;
              lineNo += 1;
              fEnd = AT_BREAK;
              break;
            }
            errors.push({ code: 'stray_cr', line: recLine, row: recRow });
            if (parts === null) parts = [text.slice(cursor, at)];
            else parts.push(text.slice(scan, at));
            scan = at + 1;
          }
        }
        fields.push(fValue);
      } while (fEnd === AT_COMMA);
      // A line that held only stray carriage returns is left with no
      // characters: no record (its stray_cr errors stay).
      if (fields.length === 1 && fields[0] === '' && !lastQuoted) skipped = true;
    }
    if (skipped) continue;
    if (width < 0) width = fields.length;
    if (wantHeader && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: wantHeader ? columns ?? [] : null, rows, errors };
}
