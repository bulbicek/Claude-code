# Podpisový kľúč pre Android APK

- Súbor: `rit-release.jks`
- Alias: `rit`
- Heslo úložiska aj kľúča: `ritpanelaky`

Každé nové APK treba podpísať týmto kľúčom, inak sa nenainštaluje cez staršiu verziu.
Tento repozitár musí ostať súkromný.

Podpísanie (uber-apk-signer):
```
java -jar uber-apk-signer.jar -a rit-unsigned.apk --ks rit-release.jks --ksAlias rit --ksPass ritpanelaky --ksKeyPass ritpanelaky
```
