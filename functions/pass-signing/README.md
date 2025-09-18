# Configuration des Passes Apple Wallet

Ce dossier contient la configuration pour la génération et la signature des passes Apple Wallet pour l'application BDB.

## Structure des fichiers

```
pass-signing/
├── certificates/          # Certificats Apple Developer
│   └── pass.com.bdb.ticket.p12
├── templates/            # Images par défaut pour les passes
│   ├── logo.png
│   ├── logo@2x.png
│   ├── icon.png
│   └── icon@2x.png
├── pass-signer.js       # Service de signature des passes
└── README.md           # Ce fichier
```

## Configuration des certificats

### 1. Obtenir le certificat Apple Developer

1. Connectez-vous à [Apple Developer Portal](https://developer.apple.com/account/)
2. Allez dans "Certificates, Identifiers & Profiles"
3. Créez un nouveau certificat de type "Pass Type ID Certificate"
4. Téléchargez le fichier `.cer`
5. Double-cliquez pour l'installer dans votre trousseau
6. Exportez-le au format `.p12` avec un mot de passe

### 2. Placer le certificat

Placez votre fichier `pass.com.bdb.ticket.p12` dans le dossier `certificates/`

### 3. Configurer les variables d'environnement

Dans `netlify.toml`, configurez :

```toml
[build.environment]
  APPLE_TEAM_IDENTIFIER = "VOTRE_TEAM_ID"
  PASS_TYPE_IDENTIFIER = "pass.com.bdb.ticket"
  PASS_CERTIFICATE_PASSWORD = "votre_mot_de_passe_p12"
```

## Images des passes

Placez les images suivantes dans le dossier `templates/` :

- `logo.png` (29x29px) - Logo principal
- `logo@2x.png` (58x58px) - Logo haute résolution
- `icon.png` (29x29px) - Icône
- `icon@2x.png` (58x58px) - Icône haute résolution

## Utilisation

### Pour un ticket d'événement

```javascript
const ticketData = {
    id: "ticket_123",
    type: "event",
    event: {
        name: "Soirée Étudiante",
        description: "Soirée étudiante à Bordeaux",
        date: "2024-12-31T23:00:00Z",
        location: "Le Bouscat, Bordeaux"
    },
    quantity: 2,
    totalAmount: 25.00,
    customerFirstName: "Jean",
    customerLastName: "Dupont",
    purchaseDate: "2024-12-15T10:00:00Z"
};
```

### Pour un ticket de boîte de nuit

```javascript
const ticketData = {
    id: "ticket_456",
    type: "nightclub",
    association: {
        name: "Club Le Bouscat"
    },
    ticketType: {
        name: "Entrée Standard",
        description: "Entrée avec consommation",
        benefits: "1 consommation incluse"
    },
    quantity: 1,
    totalAmount: 15.00,
    customerFirstName: "Marie",
    customerLastName: "Martin",
    purchaseDate: "2024-12-15T10:00:00Z"
};
```

## Endpoints disponibles

- `POST /api/create-event-pass` - Créer un pass pour un événement
- `POST /api/create-nightclub-pass` - Créer un pass pour une boîte de nuit
- `POST /api/create-pass` - Créer un pass générique (avec type dans les données)

## Sécurité

⚠️ **Important** : Ne commitez jamais vos certificats `.p12` dans le repository Git. Ajoutez le dossier `certificates/` à votre `.gitignore`.

## Dépannage

### Erreur de certificat
- Vérifiez que le fichier `.p12` est bien placé dans `certificates/`
- Vérifiez que le mot de passe est correct
- Vérifiez que le certificat n'a pas expiré

### Erreur de signature
- Vérifiez que le `teamIdentifier` correspond à votre compte Apple Developer
- Vérifiez que le `passTypeIdentifier` est correct
- Vérifiez que le certificat est bien associé au Pass Type ID
