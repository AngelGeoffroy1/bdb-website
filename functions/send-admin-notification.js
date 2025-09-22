const apn = require('apn');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Nettoie la clé des caractères indésirables ajoutés par Netlify
 * @param {string} key - La clé à nettoyer
 * @returns {string} - La clé nettoyée
 */
function cleanKeyFromNetlify(key) {
  // Enlever les triples guillemets que Netlify ajoute
  let cleanedKey = key.replace(/"""/g, '');
  
  // Enlever les guillemets simples ou doubles entourant la clé
  cleanedKey = cleanedKey.replace(/^["']|["']$/g, '');
  
  // Supprimer tout caractère non imprimable ou non ASCII
  cleanedKey = cleanedKey.replace(/[^\x20-\x7E\n]/g, '');
  
  return cleanedKey;
}

/**
 * Formate une clé en format PEM standard
 * @param {string} key - La clé à formater
 * @returns {string} - La clé formatée
 */
function formatPEMKey(key) {
  // Nettoyer d'abord la clé
  key = cleanKeyFromNetlify(key);
  
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
    const { deviceTokens, title, body, payload } = JSON.parse(event.body);
    
    if (!Array.isArray(deviceTokens) || deviceTokens.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "La liste des tokens est vide ou invalide" })
      };
    }

    if (!title || !body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Le titre et le corps de la notification sont requis" })
      };
    }

    // Configuration APN avec les variables d'environnement
    let cleanedKey;
    
    // Utiliser uniquement la clé APN_KEY standard
    console.log("🔑 Utilisation de la clé APN_KEY standard");
    const apnKey = process.env.APN_KEY;
    
    // Nettoyage préalable de la clé
    const cleanedApnKey = cleanKeyFromNetlify(apnKey);
    console.log("🧹 Nettoyage de la clé - Avant/Après:", {
      avantLongueur: apnKey.length,
      apresLongueur: cleanedApnKey.length,
      tripleGuillemetsPresents: apnKey.includes('"""'),
      tripleGuillemetsRestants: cleanedApnKey.includes('"""')
    });
    
    // Transformer la clé pour qu'elle soit au format PEM
    if (cleanedApnKey.includes("-----BEGIN PRIVATE KEY-----")) {
      // La clé a déjà les marqueurs - on la formate directement
      cleanedKey = formatPEMKey(cleanedApnKey);
    } else {
      // On ajoute les marqueurs PEM
      console.log("🔧 Ajout des marqueurs PEM à la clé");
      const keyWithMarkers = `-----BEGIN PRIVATE KEY-----\n${cleanedApnKey}\n-----END PRIVATE KEY-----`;
      cleanedKey = formatPEMKey(keyWithMarkers);
    }
    
    console.log("🔑 Format de la clé APN:", {
      hasBeginMarker: cleanedKey.includes("-----BEGIN PRIVATE KEY-----"),
      hasEndMarker: cleanedKey.includes("-----END PRIVATE KEY-----"),
      length: cleanedKey.length,
      containsNewlines: cleanedKey.includes("\n"),
      newlineCount: (cleanedKey.match(/\n/g) || []).length
    });
    
    // Pour débogage - afficher les premiers et derniers caractères visibles
    const visibleStart = cleanedKey.substring(0, 40).replace(/[^\x20-\x7E]/g, '?');
    const visibleEnd = cleanedKey.substring(cleanedKey.length - 40).replace(/[^\x20-\x7E]/g, '?');
    
    console.log("Aperçu de la clé (caractères visibles seulement):", {
      debut: visibleStart,
      fin: visibleEnd
    });
    
    // Sauvegarder la clé dans un fichier temporaire (nécessaire pour apn)
    const tmpDir = os.tmpdir();
    const keyFilePath = path.join(tmpDir, 'apn-key.p8');
    fs.writeFileSync(keyFilePath, cleanedKey);
    console.log("📝 Clé sauvegardée dans un fichier temporaire:", keyFilePath);
    
    // Afficher le contenu réel du fichier pour le débogage
    const fileContent = fs.readFileSync(keyFilePath, 'utf8');
    console.log("📄 Contenu du fichier de clé:", { 
      taille: fileContent.length,
      debut: fileContent.substring(0, 40).replace(/[^\x20-\x7E]/g, '?'),
      fin: fileContent.substring(fileContent.length - 40).replace(/[^\x20-\x7E]/g, '?')
    });
    
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
    
    // Créer la notification
    const notification = new apn.Notification();
    notification.expiry = Math.floor(Date.now() / 1000) + 24 * 3600; // Expire dans 24h
    notification.badge = 1;
    notification.sound = "default";
    notification.alert = { title, body };
    
    // Ajouter des données supplémentaires si fournies
    if (payload) {
      notification.payload = payload;
    }
    
    notification.topic = "com.babylone"; // Bundle ID de l'app

    console.log('🔔 Envoi des notifications admin:', notification);
    
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
    console.log(`✅ ${successCount} notifications admin envoyées avec succès sur ${deviceTokens.length}`);
    
    return { 
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        sent: deviceTokens.length,
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
