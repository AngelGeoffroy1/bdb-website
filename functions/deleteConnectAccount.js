const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialisation du client Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Méthode non autorisée' })
        };
    }

    try {
        // Récupérer l'ID du compte à supprimer
        const { account_id } = JSON.parse(event.body);

        if (!account_id) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'ID de compte Stripe requis' })
            };
        }

        // Supprimer le compte Stripe Connect
        const deletedAccount = await stripe.accounts.del(account_id);

        console.log(`Compte Stripe Connect ${account_id} supprimé avec succès`);

        // Supprimer également l'entrée dans Supabase
        const { error } = await supabase
            .from('stripe_connect_accounts')
            .delete()
            .eq('stripe_account_id', account_id);

        if (error) {
            console.error('Erreur lors de la suppression dans Supabase:', error);
            // On continue malgré l'erreur Supabase car le compte Stripe a été supprimé
        } else {
            console.log(`Entrée de compte ${account_id} supprimée de Supabase`);
        }

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: `Compte ${account_id} supprimé avec succès`,
                deleted: deletedAccount.deleted
            })
        };
    } catch (error) {
        console.error('Erreur lors de la suppression du compte:', error);
        
        return {
            statusCode: error.statusCode || 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: error.message || 'Erreur lors de la suppression du compte'
            })
        };
    }
}; 