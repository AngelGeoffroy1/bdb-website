const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // Configuration CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // Initialiser Supabase
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('❌ Variables d\'environnement Supabase manquantes');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Configuration serveur manquante' })
            };
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Parser les données
        const { email } = JSON.parse(event.body);

        if (!email) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'Email requis' 
                })
            };
        }

        console.log('🔍 Vérification de l\'existence de l\'utilisateur:', email);

        // Vérifier si l'utilisateur existe dans la table users (insensible à la casse)
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id, email, first_name, last_name')
            .ilike('email', email)
            .single();

        if (userError && userError.code !== 'PGRST116') {
            console.error('❌ Erreur lors de la vérification:', userError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    error: 'Erreur lors de la vérification de l\'utilisateur' 
                })
            };
        }

        const userExists = !!userData;

        console.log(`✅ Utilisateur ${userExists ? 'existe' : 'n\'existe pas'}:`, email);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                exists: userExists,
                user: userData || null
            })
        };

    } catch (error) {
        console.error('❌ Erreur serveur checkUserExists:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Erreur interne du serveur' 
            })
        };
    }
};
