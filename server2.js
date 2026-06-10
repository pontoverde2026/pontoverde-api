// 1. Ativação do Cofre (Deve ser a linha 1)
require('dotenv').config();

// --- IMPORTAÇÕES ---
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const Groq = require('groq-sdk'); // Importação do Groq

const app = express();
app.use(cors());
app.use(express.json());

// Rota de Keep-Alive para evitar que o Render hiberne
app.get('/ping', (req, res) => {
    res.status(200).json({ status: 'ativo', mensagem: 'Servidor acordado' });
});

// --- CONFIGURAÇÃO INICIAL ---
// Conexão Groq (Llama 3.1 8B Instant)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Conexão Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Calcula a distância real na superfície da Terra entre duas coordenadas (Haversine)
function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// --- ROTA DE INTEGRAÇÃO COM CACHE ---
app.post("/pesquisar", async (req, res) => {
    const { textoUsuario } = req.body; 
    const termoNormalizado = textoUsuario.toLowerCase().trim();

    try {
        let categoriaResposta; // Agora isso será sempre um ARRAY

        // 1. VERIFICAÇÃO DE CACHE (Supabase)
        const { data: cacheExistente } = await supabase
            .from('cache_ia')
            .select('categoria')
            .eq('termo', termoNormalizado)
            .single();

        if (cacheExistente) {
            // Transforma a string do banco (ex: "pneus,recicláveis") de volta em um array
            categoriaResposta = cacheExistente.categoria.split(',').map(c => c.trim());
            console.log(`[CACHE] Termo encontrado: ${termoNormalizado} -> ${categoriaResposta}`);
        } else {
            // 2. Módulo IA: Groq (Llama 3.3 70B)
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: "Você é um especialista em reciclagem. Classifique o ou os itens em uma ou mais destas palavras EXATAS: [organico, recicláveis, eletronico, movel, oleo, lampada, medicamentos, pneus]. Considere termos comuns e siglas (ex: 'pet' é 'recicláveis'). Atenção: remédios, antibióticos, princípios ativos ou materiais farmacêuticos devem ser estritamente mapeados como 'medicamentos'. Se o usuário mencionar múltiplos materiais, inclua todas as categorias correspondentes no array, sem repetições. Se o termo não for um resíduo de forma alguma, o array deve conter apenas 'invalido'. Responda APENAS o objeto JSON no formato: {\"categorias\": [\"valor1\", \"valor2\"]}, sem usar blocos de código markdown."
                    },
                    { role: "user", content: termoNormalizado }
                ],
                model: "llama-3.3-70b-versatile",
                response_format: { type: "json_object" }
            });

            const respostaIA = JSON.parse(chatCompletion.choices[0].message.content);
            
            // CORREÇÃO 1: Pega a propriedade no plural (array)
            categoriaResposta = respostaIA.categorias.map(c => c.trim());

            // CORREÇÃO 2: Verifica se o array contém a palavra invalido
            if (!categoriaResposta.includes("invalido")) {
                // CORREÇÃO 3: Transforma o array em string separada por vírgula para salvar no banco
                await supabase
                    .from('cache_ia')
                    .insert([{ termo: termoNormalizado, categoria: categoriaResposta.join(',') }]);
            } else {
                return res.json({
                    "status": "erro",
                    "mensagem_chat": `Não consegui identificar "${textoUsuario}" como um material de descarte. Tente digitar o nome do objeto (ex: garrafa, pilha, sofá).`
                });
            }
        }

        // 4. Módulo de Busca: Filtro no Supabase
        // O '.in' aceita o array diretamente
        const { data: locaisProximos, error } = await supabase
            .from('ecopontos_lorena') 
            .select('*')
            .in('tipo', categoriaResposta); 

        if (error) throw error; 

        // 5. CÁLCULO DE DISTÂNCIA E ORDENAÇÃO
        let dadosTratados = locaisProximos;

        if (req.body.lat && req.body.lon) {
            dadosTratados = locaisProximos.map(ponto => {
                const dist = calcularDistancia(
                    req.body.lat, 
                    req.body.lon, 
                    ponto.latitude, 
                    ponto.longitude
                );
                return { ...ponto, distancia_km: dist };
            });

            dadosTratados.sort((a, b) => a.distancia_km - b.distancia_km);
        }

        return res.json({
            "status": "sucesso",
            // Ajuste na mensagem para exibir as categorias de forma limpa
            "mensagem_chat": `O item "${textoUsuario}" foi classificado como: ${categoriaResposta.join(', ')}.`,
            "dados_mapa": dadosTratados
        });

    } catch (error) {
        console.error("\n[ ERRO NO SERVIDOR ]:", error);
        return res.status(500).json({ 
            "status": "erro", 
            "mensagem_chat": "Houve uma falha na conexão com os serviços de inteligência ou banco de dados." 
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor Ponto Verde rodando na porta ${PORT}`));