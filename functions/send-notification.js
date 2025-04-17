const apn = require('apn');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Formate une clé en format PEM standard
 * @param {string} key - La clé à formater
 * @returns {string} - La clé formatée
 */
function formatPEMKey(key) {
  // Extraire le contenu (sans les marqueurs PEM)
  const pemContent = key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '').trim();
  
  // Supprimer tous les sauts de ligne existants
  const contentWithoutNewlines = pemContent.replace(/\n/g, '');
  
  // Reformater avec des lignes de 64 caractères
  let formattedContent = '';
  for (let i = 0; i < contentWithoutNewlines.length; i += 64) {
    formattedContent += contentWithoutNewlines.slice(i, i + 64) + '\n';
  }
  
  // Reconstruire la clé au format PEM
  return '-----BEGIN PRIVATE KEY-----\n' + formattedContent + '-----END PRIVATE KEY-----\n';
}

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
    let cleanedKey;
    
    // Vérifier si nous utilisons la version Base64 de la clé
    if (process.env.APN_KEY_BASE64) {
      try {
        // Décoder la clé Base64
        const decodedKey = Buffer.from(process.env.APN_KEY_BASE64, 'base64').toString('utf-8');
        console.log("🔑 Utilisation de la clé APN_KEY_BASE64 (décodée)");
        
        // Formater au format PEM standard
        cleanedKey = formatPEMKey(decodedKey);
      } catch (error) {
        console.error("❌ Erreur lors du décodage de la clé Base64:", error);
        throw new Error("Impossible de décoder la clé APN_KEY_BASE64");
      }
    } else {
      // Utiliser la méthode existante avec APN_KEY
      const apnKey = process.env.APN_KEY;
      
      // Formater au format PEM standard
      cleanedKey = formatPEMKey(apnKey);
    }
    
    console.log("🔑 Format de la clé APN:", {
      hasBeginMarker: cleanedKey.includes("-----BEGIN PRIVATE KEY-----"),
      hasEndMarker: cleanedKey.includes("-----END PRIVATE KEY-----"),
      length: cleanedKey.length,
      containsNewlines: cleanedKey.includes("\n"),
      newlineCount: (cleanedKey.match(/\n/g) || []).length
    });
    
    // Pour débogage - afficher les 20 premiers caractères et les 20 derniers
    console.log("Aperçu de la clé:", {
      debut: cleanedKey.substring(0, 30) + "...",
      fin: "..." + cleanedKey.substring(cleanedKey.length - 30)
    });
    
    // Sauvegarder la clé dans un fichier temporaire (nécessaire pour apn)
    const tmpDir = os.tmpdir();
    const keyFilePath = path.join(tmpDir, 'apn-key.p8');
    fs.writeFileSync(keyFilePath, cleanedKey);
    console.log("📝 Clé sauvegardée dans un fichier temporaire:", keyFilePath);
    
    // Entourer la création du fournisseur APN dans un try/catch
    let apnProvider;
    try {
      apnProvider = new apn.Provider({
        token: {
          key: keyFilePath, // Chemin vers le fichier de clé
          keyId: process.env.APN_KEY_ID,
          teamId: process.env.APN_TEAM_ID,
        },
        production: process.env.NODE_ENV === 'production' // true en production, false en développement
      });
      console.log("✅ Fournisseur APN créé avec succès");
    } catch (error) {
      console.error("❌ Erreur lors de la création du fournisseur APN:", error);
      
      // Log plus détaillé pour comprendre l'erreur
      if (error.cause) {
        console.error("Cause détaillée:", {
          message: error.cause.message,
          code: error.cause.code,
          path: error.cause.path
        });
      }
      
      throw error;
    }
    
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

    // Nettoyer le fichier temporaire
    try {
      fs.unlinkSync(keyFilePath);
      console.log("🧹 Fichier de clé temporaire supprimé");
    } catch (cleanupError) {
      console.warn("⚠️ Impossible de supprimer le fichier temporaire:", cleanupError);
    }

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