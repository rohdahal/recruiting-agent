# Resume Drop Zone (.docx)

Put candidate resumes in **Word format** (`.docx`) in this folder.

Expected parsing-friendly fields in resume body:

- `Name: ...`
- `Title: ...`
- `Location: ...`
- `Email: ...`
- `Experience: 5`
- `Summary: ...`
- bullet points (`- ...`) for achievements

After adding files, call:

```bash
curl -X POST http://localhost:8787/api/resumes/reindex
```

Or upload through the UI.
