# Google Sheets Python (gspread)

> Source: https://github.com/burnash/gspread

## Installation

```bash
pip install gspread
```

Requires Python 3.8+

## Authentication

### Service Account (recommended for automation)

1. Create credentials in [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Download JSON key file
3. Share your spreadsheet with the service account email

```python
import gspread

gc = gspread.service_account(filename="service-account.json")
```

### OAuth (for user-facing apps)

```python
gc = gspread.oauth()
```

## Open Spreadsheet

```python
# By title
sh = gc.open("My Spreadsheet")

# By key (from URL)
sh = gc.open_by_key("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms")

# By full URL
sh = gc.open_by_url("https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms")
```

## Select Worksheet

```python
# By index (0-based)
worksheet = sh.get_worksheet(0)

# By title
worksheet = sh.worksheet("Sheet1")

# First sheet shortcut
worksheet = sh.sheet1

# List all worksheets
worksheets = sh.worksheets()
```

## Read Data

```python
# Single cell
val = worksheet.get('B1').first()
val = worksheet.cell(1, 2).value  # row, col

# Range
values = worksheet.get("A1:B4")

# All values as list of lists
from gspread.utils import GridRangeType
data = worksheet.get(return_type=GridRangeType.ListOfLists)

# All records as list of dicts (uses row 1 as headers)
records = worksheet.get_all_records()

# Row/column
row_values = worksheet.row_values(1)
col_values = worksheet.col_values(1)
```

## Write Data

```python
# Single cell
worksheet.update_acell('B1', 'New Value')

# Range (2D array)
worksheet.update([["A1", "B1"], ["A2", "B2"]], "A1:B2")

# Batch update multiple ranges
worksheet.batch_update([
    {'range': 'A1:B2', 'values': [['A1', 'B1'], ['A2', 'B2']]},
    {'range': 'D1:E2', 'values': [[1, 2], [3, 4]]}
])
```

## Find Cells

```python
import re

# Exact match
cell = worksheet.find("Search term")
print(f"Found at R{cell.row}C{cell.col}")

# Regex match
cell = worksheet.find(re.compile(r"pattern.*"))

# Find all matches
cells = worksheet.findall("Search term")
cells = worksheet.findall(re.compile(r"pattern"))
```

## Formatting

```python
# Bold header
worksheet.format('A1:D1', {'textFormat': {'bold': True}})

# Background color
worksheet.format('A1:A10', {'backgroundColor': {'red': 1, 'green': 0.9, 'blue': 0.9}})
```

## Manage Worksheets

```python
# Create
new_sheet = sh.add_worksheet(title="New Sheet", rows=100, cols=20)

# Delete
sh.del_worksheet(worksheet)

# Duplicate
sh.duplicate_sheet(source_sheet_id=0, new_sheet_name="Copy")
```

## Sharing

```python
# Share with user
sh.share('user@example.com', perm_type='user', role='writer')

# Share with anyone (link)
sh.share('', perm_type='anyone', role='reader')
```

## Create Spreadsheet

```python
sh = gc.create("New Spreadsheet")
# Must share with your email to access in browser
sh.share('your@email.com', perm_type='user', role='owner')
```

## Advanced: Get Raw/Formula Values

```python
from gspread.utils import ValueRenderOption

# Formatted (default) - as displayed
worksheet.get("A1:B2")  # [['$12.00']]

# Unformatted - raw value
worksheet.get("A1:B2", value_render_option=ValueRenderOption.unformatted)  # [[12]]

# Formula
worksheet.get("C2:D2", value_render_option=ValueRenderOption.formula)  # [['=1/1024']]
```

## Data Validation

```python
from gspread.utils import ValidationConditionType

# Number validation
worksheet.add_validation(
    'A1',
    ValidationConditionType.number_greater,
    [10],
    strict=True,
    inputMessage='Value must be greater than 10'
)

# Dropdown list
worksheet.add_validation(
    'C2:C7',
    ValidationConditionType.one_of_list,
    ['Yes', 'No'],
    showCustomUi=True
)
```

## Resources

- [gspread Documentation](https://gspread.readthedocs.io/)
- [GitHub](https://github.com/burnash/gspread)
- [Stack Overflow](http://stackoverflow.com/questions/tagged/gspread)
