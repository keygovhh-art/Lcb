# גבהה — פערזענליכע עסקנות: פונקציע־דורך־פונקציע, 16 אקטאבער 2026

**נייער באשלוס:** Personal Askan Free פלאן גייט ארויס פון Campaign Center. אלע זיבן פערזענליכע פונקציעס געהערן צו גבהה — עולם החסד, אין דער שוין־עקזיסטירנדער `/my` און MAX `/communications`.

## GitHub main־אודיט
| פונקציע | מצב פון געפֿונענעם קאוד | באווייז אין מקור |
|---|---|---|
| 1. Personal Workspace | יא | `artifacts/gavhah/src/pages/my/index.tsx` — אייגענע קעסעס, אויפגאבן, נאטיצן, פארשריט |
| 2. Focus Center | טיילווייז | `artifacts/api-server/src/routes/communications-today.ts` האט source-scoped היינט־דאטן; נישט קיין אייגענער מאָביל־טאב אין מיין עסקנות |
| 3. Brain Dump | באזונדערע פונקציע פעלט | די `/askanus/notes` API עקזיסטירט; Quick Capture UI האט געפעלט |
| 4. Personal Tasks | יא | `/askanus/tasks` מיט priority, deadline, completed/reopen |
| 5. Private Notes | יא | `/askanus/notes` userId־scoped |
| 6. Personal Follow-ups | יא | `case_followups`, timezone, repeat, done/reopen; reminder inbox אין MAX |
| 7. Personal History | יא אין קאוד | `/askanus/max/history`, `MaxHistoryPanel` אין `/my` |

**Production status:** React/routes inspected in GitHub. This does NOT certify live Render Android workflows or current Neon migration.

## צוגעלייגט אין דעם Draft PR
- אין גבהה `/my` א נייע היימישע `מיין Focus און Brain Dump` טאב. דער עקזיסטירנדע `Cases`־טאב און קעיס־Deep Links בלייבן ארבעטן.
- Focus לאדט `/api/askanus/max/today` פון **דער זעלבער פערזענליכער מקור־דאטאבעיס**. ער ווייזט אפענע אויפגאבן, יעצטיגע נאכפאלגן און אויסשטייענדיגע התחייבויות, און שלאגט פאר דריי רעקארדירטע וויכטיגע שריט. קיין AI־געשאצטע פאקטן.
- Brain Dump שיקט איין באשטעטיגטן POST צו `/api/askanus/notes`. איין קאנאנישער `askanusnotes` רעקארד ווערט דערפון; קיין צווייטע טאבעלע, קיין צווייטע API און קיין גלייך־אריבערגעבן צו Campaign Center.
- אינעם UI זענען דא קלארע עפענען־קנעפלעך צום היינטיגן טעסקס, נאטיצן און געשיכטע; זיך אפהיטן ארבעט מיט Session־רעכטן.

## וואס פעלט נאך פארן פולן פערזענליכן מאסטער־צענטער
- A real editable Focus review with day-to-day carryover/memory, automatic due-date/timezone reminders in background, and human Android UAT.
- Voice input, optional note-to-task conversions only after explicit user confirmation, and proper mobile offline sync.
- Existing MAX addon/history staging and current live Render deployment must each be checked against real Neon schema.

## Releases
Do not deploy changes to Gavhah production, do not merge unrelated experimental MAX branches, and do not modify Neon without a separate approved review and rollback. Render AutoDeploy is OFF.
