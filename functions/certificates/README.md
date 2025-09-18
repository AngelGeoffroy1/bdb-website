# Certificats Apple Wallet

Ce dossier contient les certificats nécessaires pour la signature des passes Apple Wallet.

## Structure attendue

```
functions/
├── certificates/
│   └── pass.com.bdb.ticket.p12  # Ton certificat Apple Developer
└── pass-signing/
    ├── pass-signer.js
    └── templates/
```

## Instructions

1. **Place ton certificat** `pass.com.bdb.ticket.p12` dans ce dossier
2. **Configure le mot de passe** dans les variables d'environnement Netlify
3. **Ne commite JAMAIS** le fichier `.p12` (il est dans .gitignore)

## Variables d'environnement requises

Dans Netlify, ajoute :
- `PASS_CERTIFICATE_PASSWORD` = mot de passe de ton certificat
- `APPLE_TEAM_IDENTIFIER` = ton Team ID Apple
- `PASS_TYPE_IDENTIFIER` = "pass.com.bdb.ticket"
