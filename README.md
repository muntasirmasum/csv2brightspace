# CSV to Brightspace

**<https://muntasirmasum.github.io/csv2brightspace/>**

A browser tool that turns a plain spreadsheet of quiz questions into a Brightspace (D2L) Question Library CSV, and repairs existing Brightspace CSVs that have been damaged by unquoted commas.

## Acknowledgement

This is a Brightspace counterpart to [csv2canvas](https://github.com/stephenturner/csv2canvas) by [Stephen D. Turner](https://stephenturner.us/), which does the same job for Canvas. The dependency-free single-file architecture, the drop-zone to preview to download flow, the tone of the validation messages, and the idea of shipping a copyable prompt for people whose questions live in a Word document are all his. This project reimplements that approach for Brightspace's very different import format and adds a repair mode. Any awkwardness here is mine, not his.

## Why this exists

Canvas has no bulk text import, so csv2canvas has to build a QTI XML package and a ZIP file. Brightspace is the opposite problem. It *does* accept a bulk CSV, but the CSV it accepts is a vertical key/value format with one multi-row block per question, five columns wide, and per-type row vocabularies that contradict each other:

```
NewQuestion,MC,,,
QuestionText,Which of the following BEST describes epidemiology?,,,
Points,1,,,
Option,100,The study of distribution and determinants in populations,,Correct.
Option,0,The clinical study of individual patients,,Incorrect. That is medicine.
Feedback,Epidemiology covers description and application.,,,
```

That is fine for a machine and miserable for a person. You cannot sort it, review it, or diff it as a table, and it is very easy to corrupt, because any comma in a feedback string silently truncates the field unless the whole field is quoted.

That failure is common in the wild. Across the ten question banks this tool was built against, **182 fields in 108 of 176 questions were being silently truncated on import.** For example:

```
Hint,Think of the four key parts: distribution, determinants, disease frequency, and application.,,,
```

Brightspace imports that hint as `Think of the four key parts: distribution`. Everything after the first comma is lost, with no error and no warning.

## What it does

**Build.** Write questions in a normal one-row-per-question spreadsheet, drop it in, and get a Brightspace CSV that quotes every field correctly.

**Repair.** Drop in an existing Brightspace CSV and it reports every truncated field with its line number, then hands back a repaired copy. It can also give you the same questions as a flat spreadsheet, so you can edit them in Excel and drop the result back to rebuild the Brightspace file.

It supports all seven question types Brightspace can import from a CSV: multiple choice (`MC`), multi-select (`MS`), true/false (`TF`), written response (`WR`), short answer (`SA`), matching (`M`), and ordering (`O`).

Everything happens in your browser. Nothing is uploaded, and the page works offline and straight from a `file://` URL.

## Quick start

1. Download `examples/template.csv`, or `examples/example.csv` to see all seven types filled in.
2. Add your questions.
3. Drop the file on the page and check the preview.
4. Download the Brightspace CSV, then import it: **Quizzes → Question Library → Import → Upload a File**.

## The spreadsheet format

One row per question, with a header row. Columns are matched by name, so order does not matter and columns you do not need can be left blank or deleted entirely.

| Column | Meaning |
|---|---|
| `Type` | `MC`, `MS`, `TF`, `WR`, `SA`, `M`, or `O` |
| `QuestionText` | The question. The only field Brightspace always requires. |
| `Correct` | Which choice is right. Depends on type, see below. |
| `Choice1`…`ChoiceN` | Options, accepted answers, matching items, or ordering items |
| `Fb1`…`FbN` | Feedback for the same-numbered choice |
| `Match1`…`MatchN` | The partner for the same-numbered choice (`M` only) |
| `ID`, `Title` | Optional. Brightspace generates an ID if you leave it blank. |
| `Points`, `Difficulty` | Points 0 to 100, difficulty 1 to 5 |
| `Hint`, `Feedback` | Question-level, optional |
| `Scoring` | Grading rule for `MS`, `M`, and `O` |
| `Image` | A path like `images/figure1.jpg` |
| `HTML` | `TRUE` if the text contains HTML tags |
| `InitialText`, `AnswerKey` | `WR` only |
| `InputBox`, `AnswerMode` | `SA` only |

The repeating groups are discovered from the header, so if you need an eighth choice, just add `Choice7`, `Choice8`, `Fb7`, `Fb8` and it works.

### `Correct` by type

| Type | `Correct` holds | Example |
|---|---|---|
| `MC` | the correct choice number, or weights for partial credit | `3` or `1:100,4:25` |
| `MS` | every correct choice number | `1,3` |
| `TF` | the word TRUE or FALSE | `TRUE` |
| `SA` | blank, or weights for partial-credit answers | `2:50` |
| `WR`, `M`, `O` | blank | |

## What Brightspace cannot do from a CSV

Worth knowing before you plan a question bank around it. Fill in the Blanks, Arithmetic, Significant Figures, and Multi-Short Answer questions **cannot be imported by CSV at all**, and Likert questions exist only in surveys. A CSV import also cannot switch on answer randomization or choose which Question Library section the questions land in. Those are set in Brightspace afterwards.

Images are references, not payloads. Upload your pictures into an `images` folder in the course files first, then point at them with `images/name.jpg`. Alt text has to be added by hand after importing.

## Known limits

Round-tripping a Brightspace file out to a spreadsheet and back is lossless except in three places, all of which the tool warns about:

- **Short answer.** Brightspace lets each accepted answer carry its own `regexp` flag, but it only honours the last one, so a mixed row is already broken. The spreadsheet carries one `AnswerMode` per question, which fixes that rather than preserving it.
- **Ordering.** Brightspace allows a per-item HTML flag. The spreadsheet carries one flag per question.
- **Matching.** `Match` rows are renumbered into choice order. Brightspace pairs by number rather than position, so this changes nothing about how the question behaves.

Author comments (`//` rows) and any row key the tool does not recognise are carried through the Brightspace round-trip unchanged, but are not represented in the flat spreadsheet.

## Development

There is no build step and no dependencies. `index.html` is the whole application.

```sh
open index.html                  # works from file:// too
node tests/roundtrip.mjs         # examples and fixtures
node tests/roundtrip.mjs DIR     # also round-trips every Quiz*.csv in DIR
```

`window.__csv2brightspace` exposes the parsers, emitters, and validator for poking at in the console.

See [AGENTS.md](AGENTS.md) for the architectural contract, in particular why the app must stay a single file (ES modules are CORS-blocked from a `file://` origin, so splitting it would break opening the page from disk).

## Credits and license

MIT.

The Brightspace CSV format has no published specification. D2L's own sample file is the specification, and a copy is preserved at [`examples/sample-vertical.csv`](examples/sample-vertical.csv), retrieved from `s.brightspace.com/apps/import-quiz-questions/1.39.1/sample/Sample_Question_Import_UTF8.csv`.

Prior art worth knowing about: [csv2canvas](https://github.com/stephenturner/csv2canvas) by Stephen D. Turner, which this follows; [quizwrangler](https://github.com/velthuis/quizwrangler) by Velthuis, which targets the same Brightspace formats as AI assistant skills; and [text2qti](https://github.com/gpoore/text2qti) by Geoffrey Poore, whose open [PR #80](https://github.com/gpoore/text2qti/pull/80) is the best public documentation of how D2L's QTI differs from Canvas's.
