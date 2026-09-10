# Recipe and iPhone shopping update

Selected features from stashed (2290f70), based on main 0ae4255:
- Three additional lunch recipes; smaller Super-Veggie-Bowl without eggs replaces the previous seeded variant, which is archived.
- Matching ingredient categories and recipe/scaling tests.
- iPhone recipe cache, portion selection and local shopping list generation for Apple Reminders; web-generated pending lists remain available.

Excluded: calorie target logic, fixed profile defaults/new profile columns, calorie target test and changes to the unused MetricsGrid. Existing dashboard, tracked-day habit interpretation and mindfulness import remain.

The server seeds updated recipes at startup. Before deployment, take a consistent SQLite backup. Health samples, workouts, pairing tokens and habit entries are not changed by these features. An updated iOS build is needed for the recipe picker; the previous iOS app remains compatible with the server. Full iOS compilation/device testing needs Xcode and an iPhone; the Mac mini can check Swift syntax only.
