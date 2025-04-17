const apn = require('apn');

exports.handler = async (event, context) => {
  // Vérification de la méthode HTTP
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Méthode non autorisée' })
    };
  }
  
  // Vérification de sécurité
  const authHeader = event.headers['authorization'];
  const expectedAuth = `Bearer ${process.env.NOTIFICATION_SERVER_API_KEY}`;
  
  if (authHeader !== expectedAuth) {
    return {
      statusCode: 401,
      body: JSON.stringify({ message: 'Non autorisé' })
    };
  }

  try {
    const { deviceTokens, eventData } = JSON.parse(event.body);
    
    if (!Array.isArray(deviceTokens) || deviceTokens.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "La liste des tokens est vide ou invalide" })
      };
    }

    // Configuration APN avec les variables d'environnement
    const apnKey = process.env.APN_KEY;
    
    // Déterminer si la clé est au format PEM complet
    const isPEM = apnKey.includes("-----BEGIN PRIVATE KEY-----");
    
    // Essayer différentes approches pour formater la clé
    let cleanedKey;
    if (isPEM) {
      // La clé est déjà au format PEM
      cleanedKey = apnKey;
    } else {
      // Essayer de formater la clé en PEM si elle ne l'est pas
      cleanedKey = `-----BEGIN PRIVATE KEY-----\n${apnKey}\n-----END PRIVATE KEY-----`;
      
      // Si la clé contient déjà des \n littéraux, les remplacer
      if (apnKey.includes('\\n')) {
        cleanedKey = apnKey.replace(/\\n/g, '\n');
      }
    }
    
    console.log("🔑 Format de la clé APN:", {
      hasBeginMarker: cleanedKey.includes("-----BEGIN PRIVATE KEY-----"),
      hasEndMarker: cleanedKey.includes("-----END PRIVATE KEY-----"),
      length: cleanedKey.length,
      containsNewlines: cleanedKey.includes("\n")
    });
    
    const apnProvider = new apn.Provider({
      token: {
        key: cleanedKey,
        keyId: process.env.APN_KEY_ID,
        teamId: process.env.APN_TEAM_ID,
      },
      production: process.env.NODE_ENV === 'production' // true en production, false en développement
    });
    
    // Formatter la date pour l'affichage
    const eventDate = new Date(eventData.date);
    const formattedDate = eventDate.toLocaleDateString('fr-FR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Créer la notification
    const notification = new apn.Notification();
    notification.expiry = Math.floor(Date.now() / 1000) + 24 * 3600; // Expire dans 24h
    notification.badge = 1;
    notification.sound = "default";
    notification.alert = {
      title: `📅 Nouvel événement : ${eventData.title}`,
      body: `${eventData.location} - ${formattedDate}${eventData.price > 0 ? ` - ${eventData.price}€` : ' - Gratuit'}`
    };
    
    // Ajouter des données supplémentaires
    notification.payload = { 
      event: eventData,
      type: 'new_event'
    };
    notification.topic = "com.babylone"; // À remplacer par votre Bundle ID

    console.log('🔔 Envoi des notifications:', notification);
    
    // Envoyer la notification à tous les appareils
    const results = await Promise.all(
      deviceTokens.map(token => apnProvider.send(notification, token))
    );

    // Analyser les résultats
    const failedTokens = results.flatMap((result, index) => 
      result.failed.map(failure => ({
        token: deviceTokens[index],
        reason: failure.response?.reason || "Erreur inconnue"
      }))
    );

    if (failedTokens.length > 0) {
      console.error("❌ Certaines notifications ont échoué:", failedTokens);
    }

    const successCount = deviceTokens.length - failedTokens.length;
    console.log(`✅ ${successCount} notifications envoyées avec succès sur ${deviceTokens.length}`);
    
    return { 
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        summary: {
          total: deviceTokens.length,
          success: successCount,
          failed: failedTokens.length,
          failedDetails: failedTokens
        }
      })
    };
  } catch (error) {
    console.error("❌ Erreur:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erreur serveur", details: error.message })
    };
  }
}; 