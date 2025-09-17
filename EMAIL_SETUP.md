# Configuration Email OVH pour BDB

## 📧 Variables d'environnement à ajouter dans Netlify

Ajoutez ces variables dans l'onglet "Variables d'environnement" de votre dashboard Netlify :

```
EMAIL_USER=contactus@bdbapp.fr
EMAIL_PASSWORD=votre-mot-de-passe-ovh
```

## 🔧 Configuration OVH

### Paramètres SMTP OVH :
- **Serveur SMTP** : `ssl0.ovh.net`
- **Port** : `587`
- **Sécurité** : `TLS`
- **Authentification** : Oui

### Informations d'email :
- **Email** : `contactus@bdbapp.fr`
- **Nom d'affichage** : `BDB - Le Bureau des Bureaux`

## 🚀 Fonctionnement

1. **Paiement réussi** → Webhook Stripe déclenché
2. **Tickets créés** → Stockage dans Supabase
3. **Email envoyé** → Fonction `sendTicketEmail` appelée
4. **QR codes générés** → Intégrés dans l'email HTML
5. **Client reçoit** → Email avec tous les détails

## 📱 Contenu de l'email

- ✅ **Informations client** : Nom, email
- ✅ **Détails événement** : Nom, date, lieu, prix
- ✅ **QR codes** : Un par ticket acheté
- ✅ **Design responsive** : Optimisé mobile/desktop
- ✅ **Branding BDB** : Logo, couleurs, style

## 🧪 Test

Pour tester le système :
1. Effectuez un achat test sur le site web
2. Vérifiez les logs Netlify pour les erreurs
3. Vérifiez votre boîte email (et les spams)

## 🔍 Debug

En cas de problème, vérifiez :
- Variables d'environnement correctes
- Mot de passe OVH valide
- Logs Netlify pour les erreurs détaillées
