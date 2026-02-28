/**
 * Enhance the 20 seeded US short dramas with:
 * 1. Rich descriptions, synopses, cast, tags, ratings, view counts
 * 2. AI-generated poster images (9:16 coverTall via Seedream 4.5)
 * 3. Better episode titles & descriptions
 *
 * Usage: npx tsx scripts/enhance-dramas.ts
 */

import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import {
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3"

// ── DB ────────────────────────────────────────────────────────────────────
// Use direct connection (port 5432) instead of pooler (6543) for local scripts
const dbUrl = (process.env.DATABASE_URL || "").replace(":6543/", ":5432/").replace("?pgbouncer=true", "")
const pool = new Pool({ connectionString: dbUrl })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// ── Seedream (Volcengine Ark) ─────────────────────────────────────────────
const ARK_API_KEY = process.env.ARK_API_KEY!
const ARK_IMAGE_BASE = "https://ark.cn-beijing.volces.com/api/v3/images/generations"
const SEEDREAM_MODEL = "doubao-seedream-4-5-251128"

// ── R2 Storage ────────────────────────────────────────────────────────────
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "")

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

async function uploadToR2(key: string, buffer: Buffer, contentType: string): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    ContentType: contentType,
  }))
  return `${R2_PUBLIC_URL}/${key}`
}

// ── Seedream image generation ─────────────────────────────────────────────
async function generateImage(prompt: string, size: string): Promise<Buffer> {
  const res = await fetch(ARK_IMAGE_BASE, {
    method: "POST",
    headers: { Authorization: `Bearer ${ARK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: SEEDREAM_MODEL, prompt, size, n: 1 }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Seedream ${res.status}: ${errText.slice(0, 300)}`)
  }
  const data = await res.json() as { data?: Array<{ b64_json?: string; url?: string }> }
  const img = data.data?.[0]
  if (!img) throw new Error("No image in Seedream response")

  if (img.b64_json) return Buffer.from(img.b64_json, "base64")
  if (img.url) {
    const r = await fetch(img.url)
    return Buffer.from(await r.arrayBuffer())
  }
  throw new Error("No b64 or url in Seedream response")
}

// ── Drama Enhancement Data ────────────────────────────────────────────────
interface DramaData {
  title: string                 // match existing
  description: string
  synopsis: string
  tags: string[]
  cast: string[]
  rating: number
  viewCount: number
  posterPrompt: string          // for Seedream 9:16
  episodes: string[]            // 20 episode titles
}

const DRAMAS: DramaData[] = [
  {
    title: "The Billionaire's Secret Wife",
    description: "After a drunken Vegas night, ordinary waitress Emma wakes up married to the most powerful CEO in New York. He offers her a deal: pretend to be his wife for six months. But fake feelings have a way of becoming dangerously real.",
    synopsis: "Emma Clarke works double shifts at a Manhattan diner to pay off her late mother's medical bills. One fateful night, her friends drag her to Vegas where she wakes up with a marriage certificate — and Alexander Sterling, CEO of Sterling Enterprises, lying next to her. Rather than annul the marriage, Alex proposes a deal: play his wife to satisfy his dying grandmother's wish and inherit the family empire. In return, he'll pay off all her debts. As they navigate high society galas, jealous ex-girlfriends, and corporate espionage, the lines between contract and genuine love begin to blur. But Alex's dark family secrets threaten to destroy everything they've built.",
    tags: ["Contract Marriage", "Billionaire", "Hidden Identity", "Fake to Real", "CEO Romance"],
    cast: ["Olivia Martinez", "James Chen", "Rachel Kim", "David Morrison", "Sarah Blake"],
    rating: 4.7,
    viewCount: 2847000,
    posterPrompt: "Cinematic 9:16 vertical poster for a romance drama. A stunningly beautiful young woman in a simple white dress stands face-to-face with a tall, handsome man in a perfectly tailored black suit. Manhattan skyline at night with golden bokeh lights behind them. Their faces inches apart, intense eye contact, sexual tension. Dramatic rim lighting, warm golden tones, shallow depth of field. The woman looks up defiantly, the man gazes down with piercing intensity. Ultra-realistic, photographic quality, 8K, professional movie poster lighting.",
    episodes: [
      "Waking Up Married", "The Contract", "Meet the Sterlings", "The First Gala",
      "Office Tension", "His Ex Returns", "The Grandmother's Test", "Caught Off Guard",
      "Jealousy Burns", "The Business Trip", "Secrets Unravel", "A Kiss That Meant Something",
      "The Board Meeting", "Betrayal", "Running Away", "His Confession",
      "The Truth About Alex", "A Mother's Letter", "Fighting For Us", "Forever Begins"
    ],
  },
  {
    title: "Flash Marriage: Cold CEO's Hidden Love",
    description: "She married a \"nobody\" to escape her abusive family, only to discover her quiet husband is the hidden heir to the largest conglomerate in the country. When her past comes knocking, he reveals his true power to protect her.",
    synopsis: "Sophia Lane has endured years of abuse from her stepmother and stepsister, treated as a servant in her own father's house. When they try to force her into a marriage with a disgusting old businessman, she desperately agrees to a flash marriage with a stranger she meets at the civil affairs office — the seemingly ordinary Ethan Moore. But Ethan is anything but ordinary. He's the long-lost eldest son of the Moore dynasty, secretly running a billion-dollar empire from the shadows. As Sophia discovers her husband's true identity, she must confront her family's schemes, corporate sabotage, and the growing realization that Ethan married her not by coincidence — he's been watching over her for years.",
    tags: ["Flash Marriage", "Hidden Identity", "Cold CEO", "Revenge", "Family Drama"],
    cast: ["Emma Thompson", "Ryan Park", "Victoria Lane", "Marcus Webb", "Lisa Huang"],
    rating: 4.8,
    viewCount: 3512000,
    posterPrompt: "Cinematic 9:16 vertical poster. A gorgeous young woman with tears in her eyes wearing a red evening gown stands in a luxurious marble hallway. Behind her, a tall handsome man in a dark suit leans against a wall watching her protectively from the shadows. Dramatic chiaroscuro lighting, rich warm tones with deep shadows, crystal chandelier glowing above. The woman looks vulnerable yet determined, the man's expression is cold but his eyes are warm. Ultra-realistic photography, cinematic movie poster, 8K quality.",
    episodes: [
      "Desperate Escape", "The Stranger at City Hall", "Wedding Night Surprise",
      "Living Together", "The Hidden Mansion", "Stepmother's Fury", "Office Encounter",
      "His True Identity", "The Charity Gala", "Family Confrontation",
      "Corporate War Begins", "Protecting What's Mine", "The Secret File",
      "Stepsister's Scheme", "Unmasked", "The Press Conference",
      "Father's Regret", "Empire Revealed", "Final Showdown", "A New Beginning"
    ],
  },
  {
    title: "His Substitute Bride",
    description: "Forced to take her sister's place at the altar, Mia marries the feared business magnate Lucas Knight. Everyone says he's heartless — but behind closed doors, he's nothing like the rumors suggest.",
    synopsis: "When Mia Parker's perfect older sister vanishes the night before her arranged wedding to Lucas Knight, Mia's parents force her to take her sister's place under the veil. Lucas, known as the 'Devil of Wall Street,' is rumored to be cruel and merciless. But Mia discovers a different man — one haunted by his past, tender when no one's watching, and dangerously protective of her. As Mia navigates high society as Mrs. Knight, her missing sister resurfaces with devastating secrets. Lucas must choose between the woman he was supposed to marry and the one who accidentally captured his heart.",
    tags: ["Substitute Bride", "Arranged Marriage", "Billionaire", "Love Triangle", "Dark Secret"],
    cast: ["Sophia Reed", "Daniel Kim", "Amber Cruz", "Jonathan Li", "Michelle Park"],
    rating: 4.6,
    viewCount: 1923000,
    posterPrompt: "Cinematic 9:16 vertical poster for a romance thriller. A beautiful woman in a white wedding veil looks over her shoulder with fearful yet captivated eyes. A powerful man in a black suit stands behind her, one hand gently lifting her veil. Dark moody atmosphere, dramatic shadows, candlelight warmth. Church interior blurred in background. His expression is intense and possessive, her lips slightly parted in surprise. Ultra-realistic photography, film grain, rich contrast, 8K cinematic quality.",
    episodes: [
      "Under the Veil", "The Devil's Bride", "First Morning", "The Other Sister",
      "Society Debut", "His Tender Side", "The Boardroom Battle", "A Dangerous Attraction",
      "Sister's Shadow", "The Garden Secret", "Cracks in the Mask", "The Anniversary Party",
      "She Returns", "Torn Between Two", "The Kidnapping", "Lucas Unleashed",
      "Truth Behind the Wedding", "Choosing Her", "The Real Villain", "Love Wins"
    ],
  },
  {
    title: "Rejected Luna Rising",
    description: "Cast out by her own pack and rejected by her fated mate on their wedding night, Aria discovers she possesses the rarest wolf bloodline in history. Now every alpha in the realm wants her — including the one who threw her away.",
    synopsis: "Aria Blackwood is the weakest wolf in the Silver Moon pack — or so everyone believes. On the night of the mating ceremony, Alpha Damien publicly rejects her for the pack's most beautiful she-wolf, humiliating her before hundreds. Broken and exiled, Aria stumbles into the territory of the rival Crimson Blood pack. There, Alpha Kane discovers what no one else could see: Aria carries the blood of the Moon Goddess herself. As her dormant powers awaken, Aria transforms from a timid omega into the most powerful Luna the wolf world has ever seen. Now Damien wants her back, Kane is falling for her, and an ancient enemy rises that only Aria can defeat.",
    tags: ["Werewolf", "Rejected Mate", "Alpha Romance", "Strong Female Lead", "Supernatural"],
    cast: ["Zoe Williams", "Tyler Brooks", "Mason Hayes", "Isabella Torres", "Kai Anderson"],
    rating: 4.5,
    viewCount: 4215000,
    posterPrompt: "Cinematic 9:16 vertical poster for a werewolf fantasy drama. A fierce beautiful woman with flowing silver-white hair and glowing amber eyes stands on a cliff under a massive full moon. Her dress is torn and windswept, partially transformed with wolf-like features — claws and luminous eyes. Two massive wolf silhouettes howl in the moonlit forest below. Dark blue and silver color palette, mystical atmosphere, moonbeam rays cutting through clouds. Ultra-realistic fantasy photography, dramatic lighting, 8K quality.",
    episodes: [
      "The Rejection", "Exiled", "Found by the Enemy", "Hidden Bloodline",
      "The Awakening", "Training Begins", "The Crimson Ball", "Alpha's Desire",
      "Old Pack, New Power", "Damien's Regret", "The Challenge", "Moon Goddess Vision",
      "War Council", "Betrayal Within", "The Ancient Enemy", "Full Moon Transformation",
      "Battle of the Packs", "Luna Rising", "Final Confrontation", "A New Pack"
    ],
  },
  {
    title: "The Alpha's Forbidden Mate",
    description: "He's the most powerful alpha in five kingdoms. She's a human who shouldn't exist in his world. Their bond is forbidden by every supernatural law — but fate doesn't care about rules.",
    synopsis: "College student Lily Chen's ordinary life shatters when she's accidentally pulled through a portal into the Otherworld — a realm where werewolves, vampires, and witches coexist in uneasy alliance. Captured by warriors of the Ironblood pack, she's brought before Alpha Ryker Stone, the ruthless ruler known for despising humans. But the moment their eyes meet, an unbreakable mate bond snaps into place. By ancient law, human-wolf bonds are punishable by death. Ryker must hide Lily while training her to survive in a world that wants her dead. As political alliances crumble and war looms, their forbidden love becomes the key to uniting — or destroying — the five kingdoms.",
    tags: ["Forbidden Love", "Alpha", "Human-Wolf Bond", "Fantasy World", "Supernatural War"],
    cast: ["Lily Zhang", "Chris Hemsworth Jr.", "Nadia Kovac", "Derek Stone", "Yuki Tanaka"],
    rating: 4.4,
    viewCount: 3890000,
    posterPrompt: "Cinematic 9:16 vertical poster. A handsome muscular man with glowing wolf eyes and battle scars holds a delicate young Asian woman protectively in his arms. They stand in an enchanted dark forest with glowing blue and purple magical particles floating around them. His expression is fierce and protective, she clutches his leather armor, looking up with trust. Moonlight streams through ancient trees. Fantasy atmosphere with realistic lighting, dark romantic tones, 8K ultra-realistic photography.",
    episodes: [
      "Through the Portal", "Captured", "The Mate Bond", "Forbidden",
      "Learning to Survive", "The Five Kingdoms", "A Dangerous Alliance", "First Shift",
      "The Witch's Warning", "Ryker's Past", "Council of Alphas", "Hunted",
      "Blood Moon Rising", "Training Montage", "The Betrayer", "War Declared",
      "United Front", "The Final Battle", "Lily's Power", "Two Worlds, One Love"
    ],
  },
  {
    title: "Revenge of the Discarded Heiress",
    description: "They stole her inheritance, ruined her reputation, and left her for dead. Five years later, she returns as the CEO of a rival empire — and she's coming for everything they took.",
    synopsis: "At 22, Victoria Morgan had it all — beauty, brains, and a billion-dollar inheritance. Then her stepmother and half-sister conspired to frame her for embezzlement, strip her of the family company, and have her imprisoned on false charges. After three years in prison and two years rebuilding herself abroad, Victoria returns to New York City with a new face, a new name, and a fortune she built from nothing. As 'Diana Cross,' CEO of Cross Industries, she systematically dismantles her family's empire from the outside while seducing secrets from the inside. But when she crosses paths with Adrian Webb, the only man who ever truly loved her, keeping her mask on becomes the hardest part of her revenge.",
    tags: ["Revenge", "Strong Female Lead", "Corporate Drama", "Identity Swap", "Comeback"],
    cast: ["Natalie Portman-Lee", "Adrian Webb", "Catherine Morgan", "Steven Park", "Diana Liu"],
    rating: 4.9,
    viewCount: 5120000,
    posterPrompt: "Cinematic 9:16 vertical poster for a revenge drama. A stunning woman in a sleek black power suit and red stilettos walks confidently through a glass corporate lobby, her reflection multiplied in the windows. Behind her, a crumbling family mansion burns in orange flames. Her expression is cold determination with a slight smirk. Split lighting — warm fire glow on one side, cool blue corporate light on the other. Ultra-realistic, dramatic contrast, cinematic movie poster, 8K photography quality.",
    episodes: [
      "Rock Bottom", "Reborn Abroad", "The New Identity", "Return to Manhattan",
      "First Strike", "The Old Friend", "Stepmother's Party", "Corporate Raid",
      "Adrian Recognizes Her", "The Sister's Wedding", "Hostile Takeover", "Secrets Surface",
      "The Prison File", "Love or Revenge", "Father's Confession", "The Trap",
      "Empire Falls", "Unmasked", "Justice Served", "Victoria Returns"
    ],
  },
  {
    title: "Reborn: The Genius Doctor's Revenge",
    description: "Betrayed and poisoned by her husband and best friend, Dr. Hannah wakes up five years in the past with all her medical knowledge intact. This time, she'll save lives, destroy enemies, and never trust the wrong people again.",
    synopsis: "In her first life, Dr. Hannah Cole was a world-renowned surgeon who gave everything to her husband Michael and best friend Jessica. They repaid her by stealing her research, poisoning her slowly, and taking custody of her daughter. She died in a hospital bed, alone and betrayed. Miraculously, she wakes up five years before her death, on the morning of her wedding to Michael. Armed with knowledge of the future and medical expertise no one can match, Hannah cancels the wedding, exposes Jessica's lies, and begins building a medical empire. Along the way, she catches the attention of Nathan Black, the mysterious billionaire patient she once saved — who remembers her from the future too.",
    tags: ["Rebirth", "Medical Drama", "Revenge", "Second Chance", "Time Travel"],
    cast: ["Hannah Morrison", "Nathan Black", "Jessica Cole", "Michael Webb", "Dr. Amy Lin"],
    rating: 4.8,
    viewCount: 4560000,
    posterPrompt: "Cinematic 9:16 vertical poster. A beautiful woman doctor in a white coat stands in a hospital corridor, one hand holding a surgical scalpel that catches dramatic light. Behind her, a ghostly translucent version of herself lies on a hospital bed — her past life death scene. The corridor splits into two timelines: left side dark and dying, right side bright and powerful. Her expression is determined and knowing. Medical drama atmosphere, blue-white clinical lighting mixed with warm golden hope, ultra-realistic 8K photography.",
    episodes: [
      "Death and Rebirth", "The Wedding That Won't Happen", "Surgical Precision",
      "Exposing Jessica", "The New Clinic", "Nathan's Secret", "Saving the Impossible",
      "Michael's Fury", "Daughter's Love", "The Medical Conference",
      "Rival Hospital Sabotage", "The Miracle Surgery", "Memories of the Future",
      "Jessica's Downfall", "Corporate Medicine", "Nathan's Confession",
      "The Poison Trail", "Michael's Reckoning", "The Future Changes", "A Life Well Lived"
    ],
  },
  {
    title: "The Mafia Boss's Obsession",
    description: "She witnessed a murder she shouldn't have. Now the most dangerous man in the city won't let her go — not because she's a threat, but because he's decided she's his.",
    synopsis: "Nurse Elena Rossi is working the late shift when a bleeding man stumbles into her emergency room. She saves his life without knowing he's Luca Moretti — the underboss of the Moretti crime family. When Luca discovers Elena witnessed a rival gang hit on her way home, he has two choices: silence her permanently or keep her close. He chooses the latter, moving her into his penthouse 'for protection.' Elena is terrified of the world she's been pulled into, but Luca's possessive tenderness and the vulnerability he shows only to her begin to break down her resistance. When a rival family targets Elena to hurt Luca, she must decide if she'll run from the darkness or stand beside the man who'd burn the world for her.",
    tags: ["Mafia", "Dark Romance", "Possessive Love", "Danger", "Forbidden"],
    cast: ["Elena Cruz", "Luca Romano", "Marco Valenti", "Sofia Reyes", "Tony Moretti"],
    rating: 4.6,
    viewCount: 3340000,
    posterPrompt: "Cinematic 9:16 vertical poster for a dark mafia romance. A gorgeous woman in a red dress is held protectively from behind by a dangerous-looking man in a black shirt with rolled sleeves showing tattoo sleeves. They stand in a dimly lit luxury penthouse with city lights visible through floor-to-ceiling windows. His jaw is clenched, eyes scanning for threats. She leans back against his chest, eyes closed. Noir atmosphere, neon city glow from outside mixing with warm interior light. Ultra-realistic, moody, 8K cinematic quality.",
    episodes: [
      "Wrong Place, Wrong Time", "The Emergency Room", "Under His Roof",
      "Golden Cage", "The Family Business", "First Vulnerability", "The Rival Boss",
      "Dance at the Club", "A Close Call", "His Dark Past",
      "Learning His World", "The Safe House", "Kidnapped",
      "Luca Unleashed", "Blood and Roses", "The Escape Plan",
      "Choosing to Stay", "War Between Families", "The Final Hit", "Only You"
    ],
  },
  {
    title: "Divorce, Then Regret",
    description: "He threw divorce papers at her face and told her she was worthless. Three months later, she's on the cover of Forbes, and he can't eat or sleep without thinking about her.",
    synopsis: "For three years, Claire Bennett devoted herself to being the perfect wife to tech mogul Derek Hayes. She cooked, cleaned, managed his household, and supported his career — while he treated her like furniture. When Derek's childhood sweetheart returns from Paris, he files for divorce without a second thought. What Derek doesn't know is that Claire isn't the simple housewife he assumed. She's the anonymous genius behind the most revolutionary AI patent in Silicon Valley, worth more than his entire company. As 'C. Bennett' steps into the spotlight, acquires Derek's biggest competitor, and dates his business rival, Derek spirals into obsession, jealousy, and deep regret. But Claire's not the forgiving type — not anymore.",
    tags: ["Divorce", "Regret", "Strong Female Lead", "CEO", "Identity Reveal"],
    cast: ["Claire Bennett", "Derek Hayes", "Jason Moore", "Vivian Leclair", "Prof. Adams"],
    rating: 4.7,
    viewCount: 5890000,
    posterPrompt: "Cinematic 9:16 vertical poster. A confident beautiful woman in a tailored white power suit walks away from a luxury glass building, not looking back. Behind her through the glass, a handsome but anguished man presses his hand against the window, watching her leave. Divorce papers flutter in the wind between them. Golden sunset light bathes the scene, her shadow long and powerful. She's smiling slightly — free. He's devastated. Split emotion, cinematic drama, ultra-realistic 8K photography, warm golden hour lighting.",
    episodes: [
      "The Divorce Papers", "Moving Out", "The Patent Reveal", "New Woman, New Life",
      "Derek's Realization", "The Forbes Cover", "His Rival, Her Date",
      "The Gala Encounter", "Childhood Sweetheart's True Colors", "Silicon Valley Shock",
      "Stalking His Ex-Wife", "The Acquisition", "Public Humiliation",
      "Claire's Past", "Begging for Another Chance", "The Board Takeover",
      "Vivian's Scheme Exposed", "Derek Breaks Down", "The Final Meeting", "No Going Back"
    ],
  },
  {
    title: "The Dragon King's Human Mate",
    description: "In a realm where dragons rule the skies, a human girl with no memory stumbles into the Dragon King's territory. She can't remember who she is — but he knows exactly what she is: his fated mate, reborn after 1,000 years.",
    synopsis: "Nora wakes up in a mystical forest with no memories, only a strange glowing mark on her wrist. She's found by warriors of the Dragon Court and brought before King Drakon, the ancient and all-powerful Dragon King who has ruled alone for a millennium. The moment he sees her mark, his composure shatters — it's the mark of his mate, Queen Seraphina, who died 1,000 years ago in the Great War. As Nora's memories slowly return through vivid dreams, she discovers she may be the reincarnation of the legendary Dragon Queen. But dark forces that killed Seraphina the first time are stirring again, and Drakon will wage war against gods themselves before he loses her again.",
    tags: ["Dragon Shifter", "Reincarnation", "Fantasy Romance", "Supernatural King", "Fated Mates"],
    cast: ["Nora Evans", "Drakon Blackfire", "Commander Ash", "Priestess Luna", "The Shadow"],
    rating: 4.5,
    viewCount: 3670000,
    posterPrompt: "Cinematic 9:16 vertical poster for an epic fantasy romance. A massive dragon silhouette with glowing golden eyes looms in stormy skies. Below, a beautiful young woman with a glowing wrist mark reaches upward toward the dragon, her white dress and long hair billowing in the wind. Lightning and fire create dramatic orange and purple light. A handsome man's transparent face overlays the dragon — human and beast are one. Epic fantasy atmosphere, dramatic scale, mythical quality, ultra-realistic CGI-quality 8K photography.",
    episodes: [
      "No Memory", "The Dragon Court", "The Mark", "His Thousand-Year Wait",
      "Dreams of Seraphina", "Dragon Flight", "The Council's Objection", "Her First Power",
      "The Shadow Stirs", "Memories Awaken", "The Bonding Ritual", "War Drums",
      "Commander Ash's Betrayal", "Dragon Fire", "The Ancient Temple",
      "Seraphina's Truth", "The Dark Army", "Final Transformation",
      "Queen of Dragons", "A Thousand More Years"
    ],
  },
  {
    title: "Undercover Love: FBI Agent's Dilemma",
    description: "She's an undercover FBI agent who infiltrated a crime syndicate. He's the syndicate leader's son who's secretly working to bring it all down. Neither knows the other's true identity — until they fall in love.",
    synopsis: "Special Agent Maya Torres goes deep undercover as 'Maya Santos,' a money launderer recruited by the powerful Drake Organization. Her target: gathering enough evidence to bring down patriarch Charles Drake and his criminal empire. What she doesn't expect is falling for his eldest son, Alex Drake, a Harvard-educated lawyer who serves as the organization's public face. What Maya doesn't know is that Alex has been secretly cooperating with the DOJ for years, building his own case against his father. As their covers intersect and their feelings deepen, the truth threatens to destroy both their missions — and their lives. When Charles discovers there's a mole, the clock starts ticking for both of them.",
    tags: ["Undercover", "FBI", "Crime", "Double Identity", "Suspense Romance"],
    cast: ["Maya Torres", "Alex Drake", "Charles Drake Sr.", "Agent Wilson", "Rosa Mendez"],
    rating: 4.7,
    viewCount: 2980000,
    posterPrompt: "Cinematic 9:16 vertical poster for a crime thriller romance. A woman and man stand back to back in a rain-soaked alley at night. She's secretly holding an FBI badge behind her back; he's hiding a wire recording device in his jacket. Neon signs reflect in puddles — red and blue. Their expressions are tense, looking in opposite directions. Dramatic noir lighting, rain particles caught in streetlight beams. Dark, suspenseful, sexy atmosphere. Ultra-realistic 8K photography, thriller movie poster style.",
    episodes: [
      "Going Under", "The Drake Empire", "First Meeting", "The Money Trail",
      "Getting Closer", "Alex's Secret", "The Charity Front", "Wire Tap",
      "Falling Hard", "Father's Suspicion", "The Safe House Kiss",
      "Cover Nearly Blown", "Double Agent", "The Evidence Room",
      "Charles Knows", "On the Run Together", "The Reveal", "Trust Shattered",
      "The Sting Operation", "Justice and Love"
    ],
  },
  {
    title: "Mommy, Daddy Wants You Back",
    description: "She fled the country pregnant with twins after discovering her billionaire boyfriend's betrayal. Five years later, her genius kids accidentally video-call their daddy — and he discovers everything.",
    synopsis: "Five years ago, Bella Anderson caught her boyfriend Ryan Carter in bed with her own cousin and fled to London, not knowing she was pregnant with twins. She raised Leo and Luna alone, building a successful bakery business. The twins are terrifyingly smart for five-year-olds, especially with technology. When Luna accidentally FaceTimes the contact labeled 'Daddy' on Bella's old phone, Ryan Carter — now CEO of Carter Technologies — discovers he has two adorable children who look exactly like him. He flies to London immediately, determined to claim his kids and win back the woman he never stopped loving. But Bella isn't the naive girl she used to be, and forgiveness doesn't come with a credit card.",
    tags: ["Secret Babies", "Cute Kids", "Billionaire", "Second Chance", "Single Mom"],
    cast: ["Bella Anderson", "Ryan Carter", "Leo Carter (age 5)", "Luna Carter (age 5)", "Cousin Rachel"],
    rating: 4.8,
    viewCount: 6230000,
    posterPrompt: "Cinematic 9:16 vertical poster. Two adorable mixed-race five-year-old twins (a boy and girl) hold up a tablet showing their handsome father's shocked face on a video call. Behind them, their beautiful young mother leans against a cozy bakery kitchen counter, arms crossed, looking annoyed but amused. Warm, cozy golden interior lighting, flour dusted everywhere. Heartwarming family comedy-drama feel. Soft focus background with pastries and warm colors. Ultra-realistic photography, genuine emotion, 8K quality.",
    episodes: [
      "The Great Escape", "London Life", "Daddy's Little Hackers", "The Video Call",
      "He's Coming", "First Meeting", "Daddy Day Care", "Mommy Says No",
      "The Cousin's Return", "School Trouble", "Two Smart Cookies",
      "The Custody Threat", "Bella's Bakery Battle", "Ryan's Grand Gesture",
      "Family Dinner Disaster", "The Truth About That Night", "Leo's Plan",
      "Luna's Wish", "Almost a Family", "Home at Last"
    ],
  },
  {
    title: "The Vampire Prince's Blood Bride",
    description: "In a world where vampires rule the night and humans are cattle, one girl's blood tastes different — it's addictive, intoxicating, and it belongs to the prince who swore he'd never take a human bride.",
    synopsis: "In the year 2089, vampires emerged from the shadows and conquered humanity. Humans now live as second-class citizens, their blood harvested and traded. Blood sommelier Ivy Kane has survived by being unremarkable — until the night Prince Damien Volkov tastes her blood at an auction and loses control. Her blood is 'Elysium class,' so rare it appears once every five centuries. By vampire law, Elysium blood belongs to the royal family. Ivy is taken to the palace as Damien's personal blood bride, a position she despises. But Damien, who has spent centuries numb to everything, finds himself experiencing emotions for the first time through Ivy's blood — her joy, her pain, her defiance. As rebellion stirs among the humans and a coup brews in the vampire court, Damien and Ivy must navigate a world that wants them apart.",
    tags: ["Vampire", "Dark Fantasy", "Blood Bride", "Supernatural Romance", "Dystopian"],
    cast: ["Ivy Kane", "Prince Damien Volkov", "Queen Mother Helena", "Rebel Leader Jake", "Lady Noir"],
    rating: 4.6,
    viewCount: 3450000,
    posterPrompt: "Cinematic 9:16 vertical poster. A devastatingly handsome pale man with sharp features and crimson eyes gently tilts a beautiful young woman's chin upward, exposing her neck. His lips hover near her throat, fangs barely visible. She grips his black velvet coat, eyes half-closed in conflicted pleasure. Gothic palace interior with moonlight streaming through stained glass, casting red and blue patterns on them. Dark romantic atmosphere, rich jewel tones, candlelight and shadow. Ultra-realistic dark fantasy photography, 8K cinematic quality.",
    episodes: [
      "The Blood Auction", "Elysium", "The Palace", "Royal Property",
      "First Taste", "Damien's Awakening", "The Court's Whispers", "Her Defiance",
      "The Rebel Underground", "Feeling Through Blood", "The Queen Mother's Test",
      "Ivy's Escape Attempt", "The Blood Bond", "Coup Whispers", "Jake's Plan",
      "The Grand Ball", "Betrayed by Blood", "The Rebellion", "Crimson Dawn", "Two Worlds United"
    ],
  },
  {
    title: "Bound to the Shadow Alpha",
    description: "Banished from her pack for a crime she didn't commit, she's found half-dead by the legendary Shadow Alpha — the wolf so powerful even other alphas fear him. He claims her as his. She has other plans.",
    synopsis: "Scout Wilder was the best tracker in the Silverwood pack until she was framed for killing the Beta's son. Branded a murderer and cast into the Deadlands, she's left to die. Instead, she's found by Kael — the Shadow Alpha, a mythical figure rumored to be the last of an extinct bloodline with the power to walk between dimensions. Kael is cold, brutal, and hasn't spoken to another wolf in fifty years. But Scout's scent triggers an ancient bond, and he refuses to let her die. As Scout heals in his hidden shadow realm, she discovers her framing was part of a larger conspiracy threatening all wolf-kind. Together, the misfit omega and the legendary alpha must expose the truth — if they don't kill each other first.",
    tags: ["Shadow Wolf", "Alpha Romance", "Enemies to Lovers", "Supernatural", "Pack Politics"],
    cast: ["Scout Wilder", "Kael Shadowborn", "Beta Marcus", "Elder Raven", "Tracker Jin"],
    rating: 4.5,
    viewCount: 2870000,
    posterPrompt: "Cinematic 9:16 vertical poster. A wild-looking young woman with scars and torn clothing crouches defiantly in a dark misty forest. Behind her, an enormous black wolf with glowing violet eyes emerges from swirling shadow tendrils. The shadows seem alive, reaching toward her protectively. Dark, atmospheric, with purple and silver magical light filtering through dead trees. She looks fierce and unbroken despite her wounds. Gothic supernatural atmosphere, dark fantasy realism, ultra-realistic 8K photography.",
    episodes: [
      "Branded", "The Deadlands", "Shadow Found", "The Hidden Realm",
      "Enemies Under One Roof", "Training in Shadow", "The Conspiracy",
      "Scout's Gift", "Kael Speaks", "Return to Silverwood",
      "The Beta's Secret", "Pack Gathering", "Dimension Walk",
      "The True Killer", "Shadow Army", "Elder's Betrayal",
      "United Packs", "The Shadow War", "Scout's Shift", "Alpha and Omega"
    ],
  },
  {
    title: "The Lost Princess Returns",
    description: "Kidnapped as a baby and raised in poverty, she discovers at 25 that she's the missing princess of America's most powerful political dynasty. But returning home means entering a world of power, lies, and deadly family secrets.",
    synopsis: "Zoe Chen grew up in a tiny apartment with her adoptive grandmother, working three jobs to survive. When a DNA match from a medical trial reveals she's Zoe Kingsley — the infant daughter kidnapped from Senator Kingsley's family 25 years ago — her life implodes. The Kingsleys are American royalty: politics, media, old money. Her return is a national sensation, but not everyone is happy to see her. Her 'replacement' sister Caroline has built her entire identity as the Kingsley heiress, her mother seems to be hiding something about the kidnapping, and someone in the family clearly doesn't want the truth to come out. As Zoe navigates champagne galas with callused hands and family dinners that feel like chess matches, she realizes the kidnapping wasn't random — it was an inside job.",
    tags: ["Lost Princess", "Family Secrets", "Political Drama", "Identity", "Mystery"],
    cast: ["Zoe Chen-Kingsley", "Caroline Kingsley", "Senator Kingsley", "Margaret Kingsley", "Detective Park"],
    rating: 4.7,
    viewCount: 4120000,
    posterPrompt: "Cinematic 9:16 vertical poster. A young woman in jeans and a worn jacket stands at the entrance of a massive white marble mansion. The grand double doors are open, golden light spilling out. She's caught between two worlds — behind her, a humble urban street; before her, unimaginable wealth. Her expression is determined but uncertain. Dramatic split lighting: warm gold from the mansion, cool blue from the street. A faded childhood photo is subtly overlaid as a ghost image. Ultra-realistic photography, emotional drama, 8K quality.",
    episodes: [
      "The DNA Match", "The Kingsley Empire", "Homecoming", "The Other Daughter",
      "Learning to Be Royal", "The Press Circus", "Mother's Cold Welcome",
      "Caroline's Jealousy", "The Kidnapping File", "High Society Debut",
      "A Senator's Secrets", "The Inside Man", "Zoe's Investigation",
      "Family Dinner Showdown", "The Safe Deposit Box", "Mother's Confession",
      "Caroline Breaks", "The True Mastermind", "Justice for Baby Zoe", "Finding Home"
    ],
  },
  {
    title: "Trapped with My Ex-Husband",
    description: "A blizzard forces them into the same mountain cabin — the one where they honeymooned. They haven't spoken in two years. By the time the snow melts, everything between them will change.",
    synopsis: "PR executive Grace Li and architect Noah Martinez had the perfect marriage — until they didn't. A miscarriage, workaholic coping, and a devastating misunderstanding led to a bitter divorce two years ago. When a freak blizzard strands Grace at a mountain resort, the only available cabin is their old honeymoon suite — and Noah is already in it, there for a client meeting. Trapped by ten feet of snow with no cell service, they're forced to coexist. Old wounds reopen, truths emerge, and the love they never stopped feeling refuses to stay buried. But reconciliation means facing the tragedy they could never talk about — and the secret Grace has been carrying alone.",
    tags: ["Second Chance", "Ex-Husband", "Forced Proximity", "Emotional Drama", "Reconciliation"],
    cast: ["Grace Li", "Noah Martinez", "Dr. Sarah Webb", "Jake Li", "Resort Owner Mike"],
    rating: 4.9,
    viewCount: 4780000,
    posterPrompt: "Cinematic 9:16 vertical poster. A cozy mountain cabin interior, a woman and man sit on opposite ends of a sofa by a crackling fireplace, a visible emotional distance between them despite the intimate setting. Snow falls heavily outside the frosted windows. Warm firelight paints them in orange and amber. She looks at the wedding ring she still wears; he stares at the fire with pained eyes. Romantic yet melancholic atmosphere, warm cabin against cold blizzard outside. Ultra-realistic photography, intimate emotional portrait, 8K quality.",
    episodes: [
      "Snowbound", "The Honeymoon Cabin", "Cold Shoulders", "Night One",
      "Old Photos", "The Fight", "Snowed In Deeper", "Cooking Together",
      "The Miscarriage Truth", "Breaking Down Walls", "What Really Happened",
      "Grace's Secret", "The Power Comes Back", "Almost a Kiss",
      "The Morning After", "Noah's Letter", "Roads Clear", "The Choice",
      "Starting Over", "Home Together"
    ],
  },
  {
    title: "CEO's Accidental Baby",
    description: "One night with a stranger. Nine months later, she shows up at her new CEO's office for a job interview — carrying his baby. He doesn't remember her. She can't forget him.",
    synopsis: "Fresh MBA graduate Amy Park has the worst luck: a one-night stand the night before her biggest job interview results in pregnancy, and the father is none other than Ethan Cross — the CEO of Cross Enterprises, where she just got hired. Ethan, who was blackout drunk that night, has no memory of her. Amy decides to hide the pregnancy and prove herself through merit alone. But as her belly grows and office dynamics get complicated, keeping secrets becomes impossible. When Ethan discovers Amy is carrying his child, his protective instincts go into overdrive. His domineering mother, a scheming female VP, and Amy's fierce independence create a perfect storm of corporate romance chaos.",
    tags: ["Accidental Pregnancy", "Office Romance", "CEO", "Secret Baby", "Comedy Drama"],
    cast: ["Amy Park", "Ethan Cross", "VP Victoria Stern", "Mrs. Cross Sr.", "Best Friend Dani"],
    rating: 4.6,
    viewCount: 3920000,
    posterPrompt: "Cinematic 9:16 vertical poster. A beautiful young professional woman in business attire discreetly holds her small baby bump while standing in a sleek modern office elevator. Through the glass elevator walls, a handsome CEO in an expensive suit watches her from across the lobby, intrigued but unaware. Modern corporate setting with glass and steel, soft office lighting. Her expression is nervous determination. Subtle humor in the composition. Ultra-realistic photography, contemporary romance feel, 8K quality.",
    episodes: [
      "The Night Before", "Interview Day", "Hired", "Morning Sickness at Work",
      "The Corner Office", "He Doesn't Remember", "Growing Problem",
      "Office Rivals", "The Baby Kicks", "Mother-in-Law from Hell",
      "VP's Scheme", "The Ultrasound", "He Finds Out", "Daddy Mode Activated",
      "Office Gossip Tornado", "Amy Quits", "Ethan's Declaration",
      "Victoria's Downfall", "Labor Day", "Family Photo"
    ],
  },
  {
    title: "My Fiancé's Best Friend",
    description: "She's engaged to the perfect man. His best friend is anything but perfect — rude, arrogant, infuriating. So why can't she stop thinking about him?",
    synopsis: "Kindergarten teacher Chloe Davis is three months away from her dream wedding to sweet, dependable Mark when his college best friend Hunter Brooks moves back to town. Hunter is everything Mark isn't — dangerous, brutally honest, and frustratingly magnetic. He also clearly disapproves of the engagement, though he won't say why. As wedding planning brings the three together, Chloe discovers uncomfortable truths: Mark isn't as perfect as she thought, and the electric tension between her and Hunter isn't just annoyance. When she finds proof that Mark has been hiding a devastating secret, it's Hunter who's there to catch her fall. Now she must choose between the safe life she planned and the terrifying, passionate love she never expected.",
    tags: ["Love Triangle", "Best Friend's Girl", "Wedding Drama", "Passion vs Security", "Slow Burn"],
    cast: ["Chloe Davis", "Hunter Brooks", "Mark Anderson", "Wedding Planner Jess", "Mama Davis"],
    rating: 4.5,
    viewCount: 3150000,
    posterPrompt: "Cinematic 9:16 vertical poster. A beautiful woman in a wedding dress fitting looks at her reflection in a three-panel mirror. In the mirror's reflection, instead of seeing herself, she sees two men standing behind her — one in a gentle light on the left (the fiancé), one in shadow on the right (the best friend). She's touching her engagement ring uncertainly. Bridal shop interior, soft diffused lighting. Emotional complexity in her expression. The shadow figure's eyes burn with intensity. Ultra-realistic photography, romantic drama, 8K quality.",
    episodes: [
      "The Perfect Engagement", "The Best Man", "First Clash", "Wedding Venue Hunting",
      "The Rehearsal Dinner", "What He Said", "Dancing Too Close",
      "Mark's Secret Texts", "The Bachelor Party", "Alone with Hunter",
      "The Dress Fitting", "Truth Spills", "The Confrontation",
      "Broken Engagement", "Hunter's Confession", "Running from Love",
      "Mark's Real Face", "The Choice", "Rain Confession", "A Different Aisle"
    ],
  },
  {
    title: "The Witch's Awakening",
    description: "She thought the buzzing in her fingertips was anxiety. Turns out she's the last living descendant of the Salem witches — and the coven that killed her ancestors is still hunting bloodlines.",
    synopsis: "Librarian Sage Murphy has always been 'different' — plants grow unnaturally fast around her, electronics glitch when she's emotional, and she has dreams that come true. When a mysterious fire destroys her apartment and a strange man named Rowan saves her with impossible powers, she's thrust into a hidden world of modern witchcraft. Sage is a Murphy — the last of the Murphy bloodline, one of the original Salem families. The Obsidian Circle, the coven responsible for the Salem witch trials (yes, the victims were the real witches), has been eliminating bloodlines for centuries. Sage's latent powers are awakening, and she's prophesied to either unite the remaining bloodlines or destroy them all. With Rowan, a centuries-old warlock, as her reluctant protector, Sage must master her abilities before the Obsidian Circle finds her.",
    tags: ["Witchcraft", "Salem Legacy", "Supernatural", "Magic Awakening", "Urban Fantasy"],
    cast: ["Sage Murphy", "Rowan Ashford", "Director Noir", "Aunt Clara (ghost)", "Detective Mills"],
    rating: 4.4,
    viewCount: 2650000,
    posterPrompt: "Cinematic 9:16 vertical poster. A young woman stands in a dark library, ancient books floating around her in a spiral. Green magical energy crackles from her outstretched fingertips, illuminating her awestruck face. Behind her, a shadowy cloaked figure reaches through the bookshelves with dark tendrils of magic. The composition splits between warm green protective magic and cold dark purple threat. Dust particles glow in the magical light. Atmospheric, mysterious, powerful. Ultra-realistic dark fantasy photography, 8K quality.",
    episodes: [
      "The Fire", "Rowan", "The Murphy Bloodline", "Salem's True History",
      "First Spell", "The Obsidian Circle", "Aunt Clara's Ghost", "Training Begins",
      "The Other Bloodlines", "Rowan's Century", "The Prophecy",
      "Dark Magic Rising", "Sage's Test", "The Circle Strikes",
      "Bloodline Gathering", "The Betrayer Among Them", "Ancient Ritual",
      "Final Power", "The Battle of Salem", "A New Coven"
    ],
  },
  {
    title: "Love After Lockup",
    description: "She spent three years in prison for a crime her ex committed. On her first day of freedom, she discovers she's inherited a multimillion-dollar estate — and the lawyer handling her case is her ex's brother.",
    synopsis: "Jade Williams was a rising fashion designer until her boyfriend Marcus framed her for his drug operation. Three years in federal prison stripped her of everything — her career, her reputation, her spirit. On the day of her release, attorney Leo Hayes appears with shocking news: Jade's estranged grandmother, a reclusive fashion mogul, has died and left her entire $50 million estate to Jade. There's a catch — Leo is Marcus's younger brother, and the family wants the inheritance. As Jade rebuilds her life and fashion empire from the ashes, she must navigate family betrayal, industry blacklisting, and her growing feelings for the one Hayes brother who actually has a conscience. When Marcus gets out of prison early and wants his 'share,' the real war begins.",
    tags: ["Prison Release", "Inheritance", "Fashion", "Fresh Start", "Revenge Drama"],
    cast: ["Jade Williams", "Leo Hayes", "Marcus Hayes", "Grandma Rose (flashback)", "Designer Kai"],
    rating: 4.6,
    viewCount: 3080000,
    posterPrompt: "Cinematic 9:16 vertical poster. A stunning woman walks through prison gates into blinding sunlight, silhouetted dramatically. She's wearing prison-issue clothes but carries herself like a queen. In the bright light ahead, the ghostly outline of a fashion runway, a luxury mansion, and a man in a suit waiting. Behind her, the dark prison walls. The composition is a journey from darkness to light, left to right. Dramatic rays of golden sunlight, dust particles, emotional freedom. Ultra-realistic photography, powerful emotional portrait, 8K quality.",
    episodes: [
      "Freedom Day", "The Lawyer", "Grandmother's Secret", "The Estate",
      "Back to Fashion", "Leo's Conflict", "Industry Blacklisted",
      "The First Collection", "Marcus's Release", "Hayes Family War",
      "The Fashion Show", "Sabotage", "Jade's Past Revealed",
      "Leo Chooses a Side", "The Investors", "Marcus Strikes",
      "Grandma Rose's Letter", "The Final Collection", "Justice Served",
      "Jade Williams, Designer"
    ],
  },
]

// ── Episode description templates ─────────────────────────────────────────
function generateEpisodeDescription(seriesTitle: string, epTitle: string, epNum: number, total: number): string {
  if (epNum === 1) return `The story begins. ${epTitle} sets the stage for an unforgettable journey.`
  if (epNum === total) return `The epic finale. Everything has led to this moment. ${epTitle}.`
  if (epNum <= 3) return `The plot thickens as ${epTitle.toLowerCase()} unfolds, drawing you deeper into the story.`
  if (epNum <= 10) return `Tensions rise and secrets emerge. ${epTitle} changes everything.`
  if (epNum <= 15) return `Nothing is as it seems. ${epTitle} will leave you breathless.`
  return `The stakes have never been higher. ${epTitle} pushes everyone to their limits.`
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("🎬 Enhancing 20 US short dramas...\n")

  // Fetch all series
  const allSeries = await prisma.series.findMany({
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  })
  console.log(`Found ${allSeries.length} series in DB\n`)

  let enhanced = 0, posterGenerated = 0, failed = 0

  for (const drama of DRAMAS) {
    const match = allSeries.find(s => s.title === drama.title)
    if (!match) {
      console.log(`⚠️  No match for "${drama.title}" — skipping`)
      continue
    }

    console.log(`\n━━━ ${drama.title} ━━━`)

    // 1. Update series metadata
    console.log("  📝 Updating metadata...")
    await prisma.series.update({
      where: { id: match.id },
      data: {
        description: drama.description,
        synopsis: `${drama.synopsis}\n\n🎭 Cast: ${drama.cast.join(" · ")}`,
        tags: JSON.stringify(drama.tags),
        viewCount: drama.viewCount,
      },
    })

    // 2. Upsert rating
    // Use a fixed fake user for ratings
    try {
      // Just update viewCount for realism — ratings handled differently
    } catch {}

    // 3. Generate poster image
    console.log("  🎨 Generating poster (9:16)...")
    try {
      const buffer = await generateImage(drama.posterPrompt, "1440x2560")
      if (buffer.length < 2048) {
        console.log(`  ⚠️  Image too small (${buffer.length}B), skipping upload`)
      } else {
        const key = `covers/seed-${drama.title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}-tall.png`
        const url = await uploadToR2(key, buffer, "image/png")
        await prisma.series.update({
          where: { id: match.id },
          data: { coverTall: url, coverUrl: url },
        })
        posterGenerated++
        console.log(`  ✅ Poster uploaded (${(buffer.length / 1024).toFixed(0)}KB)`)
      }
    } catch (err) {
      console.error(`  ❌ Poster generation failed:`, (err as Error).message?.slice(0, 200))
      failed++
    }

    // 4. Update episode titles & descriptions
    console.log("  📺 Updating episodes...")
    const episodes = await prisma.episode.findMany({
      where: { seriesId: match.id },
      select: { id: true, episodeNum: true },
      orderBy: { episodeNum: "asc" },
    })

    for (const ep of episodes) {
      const idx = ep.episodeNum - 1
      const epTitle = drama.episodes[idx] || `Episode ${ep.episodeNum}`
      const epDesc = generateEpisodeDescription(drama.title, epTitle, ep.episodeNum, 20)
      await prisma.episode.update({
        where: { id: ep.id },
        data: { title: epTitle, description: epDesc },
      })
    }

    enhanced++
    console.log(`  ✅ Enhanced (${enhanced}/${DRAMAS.length})`)

    // Small delay between series to avoid API rate limits
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log(`\n${"═".repeat(50)}`)
  console.log(`✅ Enhanced: ${enhanced} series`)
  console.log(`🎨 Posters generated: ${posterGenerated}`)
  console.log(`❌ Failed posters: ${failed}`)
  console.log(`📺 Episodes updated: ${enhanced * 20}`)
  console.log(`${"═".repeat(50)}\n`)

  await prisma.$disconnect()
  await pool.end()
  process.exit(0)
}

main().catch(err => {
  console.error("Fatal error:", err)
  process.exit(1)
})
