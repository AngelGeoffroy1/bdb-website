const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    // Configuration CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

        // Récupérer le token depuis les headers
        const authHeader = event.headers.authorization || event.headers.Authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ 
                    valid: false,
                    error: 'Token manquant' 
                })
            };
        }

        const token = authHeader.replace('Bearer ', '');

        console.log('🔍 Vérification du token...');

        // Vérifier le token avec Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            console.log('❌ Token invalide:', error?.message);
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ 
                    valid: false,
                    error: 'Token invalide' 
                })
            };
        }

        console.log('✅ Token valide pour:', user.id);

        // Récupérer les informations du profil utilisateur
        const { data: profileData, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError) {
            console.error('❌ Erreur récupération profil:', profileError);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ 
                    valid: false,
                    error: 'Erreur lors de la récupération du profil' 
                })
            };
        }

        // Retourner les données utilisateur
        const userData = {
            id: user.id,
            email: user.email,
            first_name: profileData.first_name,
            last_name: profileData.last_name,
            phone: profileData.phone,
            date_of_birth: profileData.date_of_birth,
            school: profileData.school,
            study_year: profileData.study_year,
            city: profileData.city,
            is_admin: profileData.is_admin,
            created_at: user.created_at
        };

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                valid: true,
                user: userData
            })
        };

    } catch (error) {
        console.error('❌ Erreur serveur verify-token:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                valid: false,
                error: 'Erreur interne du serveur' 
            })
        };
    }
};
