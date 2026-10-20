$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
$sourceRoot = $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $sourceRoot 'version.json') -Raw | ConvertFrom-Json).version
$backupRoot = Join-Path $sourceRoot 'Kopie-zapasowe'
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$stamp = [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTimeOffset]::UtcNow,'Central European Standard Time').ToString('yyyy-MM-dd_HH-mm-ss-fff')
$target = Join-Path $backupRoot ("EduLiga-kod-v{0}_{1}.zip" -f $version,$stamp)
$files = @(Get-ChildItem -LiteralPath $sourceRoot -File | Where-Object {
 $_.Name -match '^(index\.html|version\.json|ortoliga(?:-core)?\.(js|css)|ortoliga-redirect\.html|liga-[a-z-]+\.(js|css)|eduliga-[a-z-]+\.(js|svg)|AGENTS\.md|Update-Version\.ps1|Create-Backup\.ps1|URUCHOMIENIE-SYNC\.md)$'
})
foreach ($folder in @('supabase/migrations','supabase/functions')) {
 $path = Join-Path $sourceRoot $folder
 if(Test-Path -LiteralPath $path){$files += Get-ChildItem -LiteralPath $path -File -Recurse | Where-Object { $_.Extension -in @('.ts','.js','.json','.sql','.toml','.md') -and $_.FullName -notmatch '[\\/](node_modules|\.temp)[\\/]' -and $_.Name -notmatch '^\.' }}
}
foreach($relative in @('supabase/config.toml','.firebase-hosting/firebase.json','.firebase-hosting/.firebaserc','.firebase-hosting/Prepare-Hosting.ps1','.firebase-hosting/Deploy-Hosting.ps1')) {
 $path=Join-Path $sourceRoot $relative
 if(Test-Path -LiteralPath $path -PathType Leaf){$files += Get-Item -LiteralPath $path}
}
$stream=[System.IO.File]::Open($target,[System.IO.FileMode]::CreateNew)
try {
 $zip=[System.IO.Compression.ZipArchive]::new($stream,[System.IO.Compression.ZipArchiveMode]::Create,$true)
 try {
  foreach($file in ($files | Sort-Object FullName -Unique)) {
   $relative=[System.IO.Path]::GetRelativePath($sourceRoot,$file.FullName).Replace('\','/')
   [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$relative,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
  $entry=$zip.CreateEntry('ODTWORZENIE-KOPII.txt')
  $writer=[System.IO.StreamWriter]::new($entry.Open(),[System.Text.UTF8Encoding]::new($false))
  try{$writer.Write("EduLiga $version`nKopia kodu, konfiguracji hostingu i migracji SQL.`nNie zawiera bazy danych, zdjęć uczniów, haseł ani uprawnień publikacji.`nRozpakuj do nowego folderu. Produkcyjny plik index.html to pełna aplikacja Firebase.`nRepozytoria GitHub publikują index.html z szablonu ortoliga-redirect.html.`nPublikacja wymaga osobnego zalogowania do Firebase i dostępu do istniejącego Supabase.`n")}finally{$writer.Dispose()}
 }finally{$zip.Dispose()}
}finally{$stream.Dispose()}
Write-Output $target
