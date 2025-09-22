# 🔔 Système de Notifications - Vente de Tickets

## Vue d'ensemble

Le système de notifications pour les ventes de tickets permet d'informer automatiquement les administrateurs d'associations lorsqu'un utilisateur achète un ticket pour un événement de leur association.

## Fonctionnalités

### 📱 Notification aux Admins
- **Déclencheur** : Paiement réussi d'un ticket
- **Destinataires** : Tous les administrateurs de l'association organisatrice
- **Contenu** : Nom de l'acheteur + nom de l'événement
- **Format** : Notification push iOS via APNs

## Architecture

### 1. Fonction `notify-admin-ticket-sale.js`
**Route** : `POST /.netlify/functions/notify-admin-ticket-sale`

**Payload requis** :
```json
{
  "associationId": "uuid-de-l-association",
  "eventId": "uuid-de-l-evenement", 
  "buyerId": "uuid-de-l-acheteur",
  "eventName": "Nom de l'événement",
  "buyerName": "Prénom Nom de l'acheteur",
  "buyerProfileURL": "https://url-photo-profil.jpg" // optionnel
}
```

**Processus** :
1. Récupération des admins de l'association
2. Récupération des device tokens des admins
3. Création et envoi de la notification APNs
4. Retour du résumé des envois

### 2. Intégration dans le Webhook Stripe
**Fichier** : `stripe-webhook.js`
**Déclencheur** : `payment_intent.succeeded`

Le webhook Stripe appelle automatiquement la fonction de notification après :
- Création des tickets
- Mise à jour des stocks
- Avant l'envoi de l'email de confirmation

## Configuration

### Variables d'environnement requises
```bash
# APNs Configuration
APN_KEY=your_apn_private_key
APN_KEY_ID=your_key_id
APN_TEAM_ID=your_team_id

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_service_key

# Sécurité
NOTIFICATION_SERVER_API_KEY=your_api_key
```

### Base de données
**Tables utilisées** :
- `association_admins` : Liaison association ↔ admins
- `users` : Informations utilisateurs et device tokens
- `events` : Informations des événements

## Utilisation

### Depuis l'application mobile
L'app mobile n'a rien à faire de spécial. La notification est automatiquement déclenchée lors du paiement réussi.

### Test manuel
```bash
# Appel direct à la fonction
curl -X POST https://your-domain/.netlify/functions/notify-admin-ticket-sale \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "associationId": "uuid-association",
    "eventId": "uuid-event",
    "buyerId": "uuid-buyer",
    "eventName": "Nom Événement",
    "buyerName": "Jean Dupont"
  }'
```

### Test avec le script de test
```bash
# Exécuter le script de test
node functions/test-notification.js
```

## Gestion des erreurs

### Erreurs courantes
1. **Aucun admin trouvé** : Retourne un succès avec message informatif
2. **Aucun device token** : Retourne un succès avec message informatif
3. **Erreur APNs** : Logs détaillés + nettoyage des fichiers temporaires
4. **Erreur Supabase** : Retour d'erreur avec détails

### Logs
Tous les logs sont préfixés avec des emojis pour faciliter le debugging :
- 🔔 Notifications
- ✅ Succès
- ❌ Erreurs
- ⚠️ Avertissements
- 📝 Informations

## Sécurité

### Authentification
- Vérification du header `Authorization: Bearer TOKEN`
- Token configuré via `NOTIFICATION_SERVER_API_KEY`

### Validation
- Vérification des paramètres requis
- Validation des UUIDs
- Nettoyage des clés APNs

### Nettoyage
- Suppression automatique des fichiers temporaires
- Gestion des erreurs sans crash du système

## Monitoring

### Métriques importantes
- Nombre de notifications envoyées
- Taux d'échec des notifications
- Temps de réponse de la fonction
- Erreurs APNs

### Logs à surveiller
```bash
# Succès
✅ X notifications envoyées avec succès sur Y

# Erreurs
❌ Certaines notifications ont échoué: [détails]
❌ Erreur lors de la création du fournisseur APN
```

## Développement

### Ajout de nouvelles fonctionnalités
1. Modifier `notify-admin-ticket-sale.js` pour la logique
2. Mettre à jour le webhook si nécessaire
3. Tester avec le script de test
4. Documenter les changements

### Debugging
1. Vérifier les logs dans Netlify Functions
2. Utiliser le script de test pour isoler les problèmes
3. Vérifier la configuration APNs
4. Contrôler les données Supabase

## Support

En cas de problème :
1. Vérifier les logs de la fonction
2. Tester la configuration APNs
3. Vérifier les données Supabase
4. Utiliser le script de test pour diagnostiquer
