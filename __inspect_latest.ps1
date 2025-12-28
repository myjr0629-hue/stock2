$j = Get-Content .\snapshots\latest.json -Raw | ConvertFrom-Json
"TOP-LEVEL KEYS:"
($j | Get-Member -MemberType NoteProperty | Select-Object -Expand Name)

"---"
if ($null -eq $j.tickers) { "NO tickers property on latest.json" ; exit }

$t = $j.tickers[0]
"FIRST TICKER KEYS:"
($t | Get-Member -MemberType NoteProperty | Select-Object -Expand Name)

"---"
"OPTIONS PATH CHECK:"
"has options? " + [bool]($t.PSObject.Properties.Name -contains 'options')
"has options_status? " + [bool]($t.PSObject.Properties.Name -contains 'options_status')
"has optionsStatus? " + [bool]($t.PSObject.Properties.Name -contains 'optionsStatus')
"has v71? " + [bool]($t.PSObject.Properties.Name -contains 'v71')
if ($t.PSObject.Properties.Name -contains 'v71') {
  "v71 keys:"
  ($t.v71 | Get-Member -MemberType NoteProperty | Select-Object -Expand Name)
}
