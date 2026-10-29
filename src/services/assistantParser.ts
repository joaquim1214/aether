export interface ParsedAssistantAction {
  name:
    | 'addVaultItem'
    | 'updateOrCreateSkill'
    | 'manageWishlist'
    | 'scheduleCalendarEvent'
    | 'createGoogleTask';
  args: Record<string, any>;
}

const WEEKDAY_MAP: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
};

export function resolveTargetDayOfMonth(prompt: string): {
  dayOfMonth: number;
  dayLabel: string;
} {
  const now = new Date();
  const todayDay = now.getDate();
  const lower = prompt.toLowerCase();

  if (lower.includes('pasado mañana') || lower.includes('pasado manana')) {
    const target = new Date(now);
    target.setDate(now.getDate() + 2);
    return {
      dayOfMonth: target.getDate(),
      dayLabel: 'Pasado mañana',
    };
  }

  if (lower.includes('mañana') || lower.includes('manana')) {
    const target = new Date(now);
    target.setDate(now.getDate() + 1);
    return {
      dayOfMonth: target.getDate(),
      dayLabel: 'Mañana',
    };
  }

  for (const [dayName, targetDow] of Object.entries(WEEKDAY_MAP)) {
    const regex = new RegExp(
      `\\b(?:este|el|proximo|próximo)?\\s*${dayName}\\b`,
      'i'
    );
    if (regex.test(lower)) {
      const currentDow = now.getDay();
      let diff = (targetDow - currentDow + 7) % 7;
      if (diff === 0) diff = 7; // next occurrence if same weekday mentioned with "este/próximo"
      const target = new Date(now);
      target.setDate(now.getDate() + diff);
      const capitalized =
        dayName.charAt(0).toUpperCase() + dayName.slice(1).toLowerCase();
      return {
        dayOfMonth: target.getDate(),
        dayLabel: `${capitalized} ${target.getDate()}`,
      };
    }
  }

  const explicitDayMatch = prompt.match(
    /\b(?:el\s+d[ií]a|d[ií]a|el)\s+(\d{1,2})\b/i
  );
  if (explicitDayMatch) {
    const parsedDay = parseInt(explicitDayMatch[1], 10);
    if (parsedDay >= 1 && parsedDay <= 31) {
      return {
        dayOfMonth: parsedDay,
        dayLabel: `Día ${parsedDay}`,
      };
    }
  }

  return {
    dayOfMonth: todayDay,
    dayLabel: `Hoy (${todayDay})`,
  };
}

export function parseTimeRangeFromPrompt(prompt: string): string {
  // Check range like "de 6 a 8 pm" or "de 18:00 a 19:30"
  const rangeMatch = prompt.match(
    /\bde\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:a|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i
  );
  if (rangeMatch) {
    let startH = parseInt(rangeMatch[1], 10);
    const startM = rangeMatch[2] || '00';
    const startMeridiem = (rangeMatch[3] || rangeMatch[6] || '').toLowerCase();
    let endH = parseInt(rangeMatch[4], 10);
    const endM = rangeMatch[5] || '00';
    const endMeridiem = (rangeMatch[6] || rangeMatch[3] || '').toLowerCase();

    if (startMeridiem === 'pm' && startH < 12) startH += 12;
    if (startMeridiem === 'am' && startH === 12) startH = 0;
    if (endMeridiem === 'pm' && endH < 12) endH += 12;
    if (endMeridiem === 'am' && endH === 12) endH = 0;

    return `${String(startH).padStart(2, '0')}:${startM} - ${String(endH).padStart(2, '0')}:${endM}`;
  }

  // Single start time like "a las 6 pm", "a las 6:30 pm", "a las 18:00"
  const explicitTime =
    prompt.match(
      /a\s+las\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|de\s+la\s+tarde|de\s+la\s+noche|de\s+la\s+mañana)?/i
    ) || prompt.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i);

  let hour = 18;
  let minute = '00';

  if (explicitTime) {
    hour = parseInt(explicitTime[1], 10);
    minute = explicitTime[2] || '00';
    const suffix = (explicitTime[3] || '').toLowerCase();
    if (
      (suffix === 'pm' ||
        suffix.includes('tarde') ||
        suffix.includes('noche')) &&
      hour < 12
    ) {
      hour += 12;
    } else if (suffix === 'am' && hour === 12) {
      hour = 0;
    }
  }

  const endHour = Math.min(23, hour + 1);
  const endMin = minute === '00' ? '30' : minute;
  return `${String(hour).padStart(2, '0')}:${minute} - ${String(endHour).padStart(2, '0')}:${endMin}`;
}

function cleanExtractedTitle(raw: string): string {
  return raw
    .replace(
      /\s+(?:con\s+nota|con\s+calificaci[oó]n|con\s+un|nota\s+de|nota|calificaci[oó]n)\s+\d+(?:\.\d+)?(?:\s*\/\s*10)?.*$/i,
      ''
    )
    .replace(
      /\s+(?:en\s+la\s+b[oó]veda|en\s+mi\s+b[oó]veda|a\s+la\s+b[oó]veda|a\s+mi\s+b[oó]veda|a\s+mi\s+m[uú]sica|en\s+mi\s+m[uú]sica|en\s+spotify|de\s+spotify|en\s+imdb).*$/i,
      ''
    )
    .replace(/^["'«“]+|["'»”]+$/g, '')
    .trim();
}

export function parseNaturalLanguageCommand(
  prompt: string,
  currentContext?: {
    skills?: any[];
    vaultItems?: any[];
    recentRecommendations?: any[];
  }
): ParsedAssistantAction[] {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();
  const actions: ParsedAssistantAction[] = [];

  // 0A. Check if the user is ordering "Guárdala en la Bóveda" or "Agrégala al Hype Radar" for a recent recommendation
  if (
    currentContext?.recentRecommendations &&
    currentContext.recentRecommendations.length > 0
  ) {
    const recFollowUp = parseRecommendationFollowUp(
      trimmed,
      currentContext.recentRecommendations
    );
    if (recFollowUp.length > 0) {
      return recFollowUp;
    }
  }

  // 0B. Do not trigger add actions when the user is asking for recommendations
  if (isRecommendationIntent(trimmed)) {
    return [];
  }

  // ==========================================================================
  // 1. CALENDAR / AGENDA DETECTION ("Agéndame un partido de fútbol este viernes a las 6 pm")
  // ==========================================================================
  const isScheduleIntent =
    lower.includes('agéndame') ||
    lower.includes('agendame') ||
    lower.includes('agenda ') ||
    lower.includes('agendar') ||
    lower.includes('programa ') ||
    lower.includes('programar') ||
    lower.includes('en el calendario') ||
    lower.includes('en google calendar') ||
    ((lower.includes('este viernes') ||
      lower.includes('este sábado') ||
      lower.includes('este sabado') ||
      lower.includes('este domingo') ||
      lower.includes('este lunes') ||
      lower.includes('este martes') ||
      lower.includes('este miércoles') ||
      lower.includes('este jueves') ||
      lower.includes('mañana a las') ||
      lower.includes('hoy a las')) &&
      /a\s+las\s+\d/i.test(lower));

  if (isScheduleIntent) {
    const { dayOfMonth, dayLabel } = resolveTargetDayOfMonth(trimmed);
    const timeRange = parseTimeRangeFromPrompt(trimmed);

    let eventTitle = trimmed
      .replace(
        /^(?:por\s+favor\s+)?(?:ag[eé]ndame|agenda|agendar|programa|programar)\s+(?:un\s+|una\s+|el\s+|la\s+)?/i,
        ''
      )
      .replace(
        /\s+(?:este|el|pr[oó]ximo)\s+(?:lunes|martes|mi[eé]rcoles|miercoles|jueves|viernes|s[aá]bado|sabado|domingo).*$/i,
        ''
      )
      .replace(/\s+(?:mañana|manana|hoy|pasado\s+mañana).*$/i, '')
      .replace(/\s+a\s+las\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?.*$/i, '')
      .replace(/\s+en\s+(?:mi\s+)?(?:google\s+)?calend(?:ar|ario).*$/i, '')
      .trim();

    if (!eventTitle || eventTitle.length < 2) {
      eventTitle = 'Sesión / Entrenamiento Agendado';
    } else {
      eventTitle = eventTitle.charAt(0).toUpperCase() + eventTitle.slice(1);
    }

    const isSportEvent =
      lower.includes('fútbol') ||
      lower.includes('futbol') ||
      lower.includes('básquet') ||
      lower.includes('basquet') ||
      lower.includes('partido') ||
      lower.includes('entrenamiento');

    actions.push({
      name: 'scheduleCalendarEvent',
      args: {
        title: eventTitle,
        timeRange,
        dayOfMonth,
        dayLabel,
        description: `Agendado con Aether Assistant (${dayLabel} · ${timeRange})`,
        accent: isSportEvent ? 'mint' : 'lavender',
      },
    });
  }

  // ==========================================================================
  // 2. SKILLS & SPORTS PRACTICE ("Regístrame 45 minutos de práctica de básquet con 3 triples anotados y +50 XP")
  // ==========================================================================
  const minutesMatch = trimmed.match(
    /(\d+(?:\.\d+)?)\s*(?:minutos?|mins?|min\b)/i
  );
  const hoursMatch = trimmed.match(
    /(\d+(?:\.\d+)?)\s*(?:horas?|hrs?|h\b|entrenamientos?|sesiones?)/i
  );
  const xpMatch = trimmed.match(/\+?\s*(\d+)\s*xp\b/i);
  const triplesMatch = trimmed.match(
    /(\d+(?:\/\d+)?\s*triples?(?:\s+anotados?|\s+seguidos?)?)/i
  );
  const goalsMatch = trimmed.match(
    /(\d+\s*goles?(?:\s+anotados?)?|\d+\s*asistencias?)/i
  );

  const isBasketball =
    lower.includes('básquet') ||
    lower.includes('basquet') ||
    lower.includes('basketball') ||
    lower.includes('triple') ||
    lower.includes('tiro') ||
    lower.includes('cancha');
  const isFootball =
    lower.includes('fútbol') ||
    lower.includes('futbol') ||
    lower.includes('gol') ||
    lower.includes('regate');

  const isSkillIntent =
    !isScheduleIntent &&
    (Boolean(minutesMatch) ||
      Boolean(hoursMatch) ||
      Boolean(xpMatch) ||
      Boolean(triplesMatch) ||
      Boolean(goalsMatch) ||
      ((isBasketball || isFootball) &&
        (lower.includes('registr') ||
          lower.includes('entren') ||
          lower.includes('practi') ||
          lower.includes('jug') ||
          lower.includes('metí') ||
          lower.includes('meti') ||
          lower.includes('anoté') ||
          lower.includes('anote') ||
          lower.includes('sum'))));

  if (isSkillIntent) {
    let hoursToAdd = 1;
    let durationLabel = '1h';
    if (minutesMatch) {
      const mins = parseFloat(minutesMatch[1]) || 45;
      hoursToAdd = Number((mins / 60).toFixed(2));
      durationLabel = `${mins} min`;
    } else if (hoursMatch) {
      hoursToAdd = parseFloat(hoursMatch[1]) || 1;
      durationLabel = `${hoursToAdd}h`;
    }

    const explicitXp = xpMatch ? parseInt(xpMatch[1], 10) : null;
    const progressDelta = explicitXp ?? Math.min(40, Math.max(10, Math.round(hoursToAdd * 15)));

    let matchedSkill = isBasketball
      ? 'Básquet · Tiro & Manejo de Balón'
      : isFootball
      ? 'Fútbol · Control, Físico & Definición'
      : 'Arquitectura UI/UX & Sistemas';
    let branch: 'learning' | 'sports' =
      isBasketball || isFootball ? 'sports' : 'learning';
    let category = isBasketball
      ? 'Deporte · Básquet'
      : isFootball
      ? 'Deporte · Fútbol'
      : 'Ingeniería & Diseño';

    const existingSkills: any[] = currentContext?.skills || [];
    for (const s of existingSkills) {
      const sLower = String(s.name || '').toLowerCase();
      if (
        (isBasketball &&
          (sLower.includes('básquet') || sLower.includes('basquet'))) ||
        (isFootball &&
          (sLower.includes('fútbol') || sLower.includes('futbol')))
      ) {
        matchedSkill = s.name;
        category = s.category || category;
        branch = s.branch || 'sports';
        break;
      }
      const keywords = sLower
        .split(/[\s/&·]+/)
        .filter((w: string) => w.length > 3);
      if (keywords.some((kw: string) => lower.includes(kw))) {
        matchedSkill = s.name;
        category = s.category || category;
        branch = s.branch || branch;
        break;
      }
    }

    const extractedStat = triplesMatch
      ? triplesMatch[1].trim()
      : goalsMatch
      ? goalsMatch[1].trim()
      : undefined;

    const milestoneParts: string[] = [`Práctica (${durationLabel})`];
    if (extractedStat) milestoneParts.push(extractedStat);
    if (explicitXp) milestoneParts.push(`+${explicitXp} XP`);

    actions.push({
      name: 'updateOrCreateSkill',
      args: {
        skillName: matchedSkill,
        branch,
        category,
        hoursToAdd,
        durationLabel,
        progressDelta,
        sportStats: extractedStat
          ? `${extractedStat}${explicitXp ? ` · +${explicitXp} XP` : ''}`
          : undefined,
        newMilestone: milestoneParts.join(' · '),
      },
    });
  }

  // ==========================================================================
  // 3. VAULT (BÓVEDA: PELÍCULAS, SERIES, MÚSICA/SPOTIFY, PRÓXIMAMENTE, VIDEOS, PERSONAS)
  // ==========================================================================
  const ratingMatch =
    trimmed.match(/(?:nota|calificaci[oó]n)\s*(?:de\s*)?(\d+(?:\.\d+)?)/i) ||
    trimmed.match(/(\d+(?:\.\d+)?)\s*\/\s*10\b/) ||
    trimmed.match(/le\s+doy\s+(?:un\s+)?(\d+(?:\.\d+)?)/i) ||
    trimmed.match(/(\d+(?:\.\d+)?)\s*estrellas/i);

  const isMusicIntent =
    lower.includes('álbum') ||
    lower.includes('album') ||
    lower.includes('canción') ||
    lower.includes('cancion') ||
    lower.includes('música') ||
    lower.includes('musica') ||
    lower.includes('spotify') ||
    lower.includes('playlist') ||
    lower.includes('track') ||
    lower.includes('tema ');

  const isWishlistIntent =
    lower.includes('wishlist') ||
    lower.includes('presupuesto') ||
    lower.includes('fondo de ahorro') ||
    lower.includes('ahorro disponible') ||
    lower.includes('comprar');

  const isTaskIntent =
    lower.includes('tarea') ||
    lower.includes('google tasks') ||
    lower.includes('pendiente:');

  const hasGeneralAddVerb =
    /(?:quiero\s+)?(?:guardar?|añadir?|aña[d]e|agregar?|agrega|registrar?|registra|vi\b|termin[eé]\s+de\s+ver|pon(?:er)?\s+en\s+mi\s+b[oó]veda)/i.test(
      trimmed
    );

  const isMovieOrVaultIntent =
    isMusicIntent ||
    Boolean(ratingMatch) ||
    lower.includes('película') ||
    lower.includes('pelicula') ||
    lower.includes('serie') ||
    lower.includes('anime') ||
    lower.includes('documental') ||
    lower.includes('bóveda') ||
    lower.includes('boveda') ||
    lower.includes('próximamente') ||
    lower.includes('proximamente') ||
    lower.includes('estreno') ||
    lower.includes('video') ||
    lower.includes('terminé de ver') ||
    lower.includes('termine de ver') ||
    (hasGeneralAddVerb && !isWishlistIntent && !isTaskIntent);

  if (isMovieOrVaultIntent && !isSkillIntent && !isScheduleIntent) {
    const rating = ratingMatch
      ? Math.min(10, Math.max(1, parseFloat(ratingMatch[1])))
      : 9.5;
    const tier = rating >= 9 ? 'S' : rating >= 7.8 ? 'A' : 'B';

    let vaultGroup = 'peliculas_series';
    let category = 'Cine';

    if (
      lower.includes('próximamente') ||
      lower.includes('proximamente') ||
      lower.includes('estreno') ||
      lower.includes('hype')
    ) {
      vaultGroup = 'proximamente';
      category = 'Próximamente';
    } else if (isMusicIntent) {
      vaultGroup = 'musica';
      category = 'Música';
    } else if (
      lower.includes('video') ||
      lower.includes('youtube') ||
      lower.includes('charla') ||
      lower.includes('ensayo')
    ) {
      vaultGroup = 'videos';
      category = 'Video';
    } else if (
      lower.includes('persona') ||
      lower.includes('mentor') ||
      lower.includes('amigo')
    ) {
      vaultGroup = 'personas';
      category = 'Persona';
    } else if (
      lower.includes('momento') ||
      lower.includes('recuerdo') ||
      lower.includes('viaje')
    ) {
      vaultGroup = 'momentos';
      category = 'Momento';
    } else if (
      lower.includes('serie') ||
      lower.includes('anime') ||
      lower.includes('temporada')
    ) {
      vaultGroup = 'peliculas_series';
      category = 'Serie';
    }

    const imdbIdMatch = trimmed.match(/\b(tt\d{6,10})\b/i);
    let title = '';
    let creator = '';

    // Pattern A: Music with artist ("Añade el álbum Random Access Memories de Daft Punk a mi música" or "Guarda la canción Midnight City de M83")
    const musicWithArtistMatch = trimmed.match(
      /(?:álbum|album|canción|cancion|tema|track|disco)\s+["'«“]?(.+?)["'»”]?\s+de\s+([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ\s.&\-]{2,40}?)(?:\s+a\s+mi|\s+en\s+mi|\s+en\s+la|\s+en\s+spotify|\s+con\s+nota|,|\s*$)/i
    );

    // Pattern B: Playlist ("Guarda mi playlist Deep Work de Spotify")
    const playlistMatch = trimmed.match(
      /playlist\s+["'«“]?([^"'»”]+?)["'»”]?(?:\s+de\s+spotify|\s+en\s+spotify|\s+a\s+mi|\s+en\s+la|$)/i
    );

    // Pattern C: Movie / Series ("Guarda la película Interstellar con nota 9.5 en la Bóveda")
    const movieOrMediaMatch = trimmed.match(
      /(?:película|pelicula|serie|anime|documental|obra|estreno|video)\s+["'«“]?(.+?)["'»”]?(?:\s+con\s+nota|\s+con\s+calificaci|\s+con\s+un|\s+le\s+doy|\s+en\s+la\s+b[oó]veda|\s+a\s+la\s+b[oó]veda|\s+en\s+mi\s+b[oó]veda|,|$)/i
    );

    const quotedMatch = trimmed.match(/["'«“]([^"'»”]+)["'»”]/);

    if (musicWithArtistMatch && musicWithArtistMatch[1]) {
      title = cleanExtractedTitle(musicWithArtistMatch[1]);
      creator = cleanExtractedTitle(musicWithArtistMatch[2]);
    } else if (playlistMatch && playlistMatch[1]) {
      title = cleanExtractedTitle(playlistMatch[1]);
      creator = 'Playlist · Spotify';
    } else if (movieOrMediaMatch && movieOrMediaMatch[1]) {
      title = cleanExtractedTitle(movieOrMediaMatch[1]);
    } else if (quotedMatch && quotedMatch[1]) {
      title = cleanExtractedTitle(quotedMatch[1]);
      const afterQuoteArtist = trimmed
        .slice((quotedMatch.index || 0) + quotedMatch[0].length)
        .match(/^\s+de\s+([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ\s.&\-]{2,35}?)(?:\s+en|\s+a\s+mi|\s+con|,|$)/i);
      if (afterQuoteArtist && afterQuoteArtist[1]) {
        creator = cleanExtractedTitle(afterQuoteArtist[1]);
      }
    } else {
      const genericVerbMatch = trimmed.match(
        /(?:(?:quiero|puedes|podr[ií]as|por\s+favor)\s+)?(?:guardar?|añadir?|añade|agregar?|agrega|registrar?|registra|vi|termin[eé]\s+de\s+ver)\s+(?:la\s+pel[ií]cula\s+|la\s+serie\s+|el\s+[aá]lbum\s+|la\s+canci[oó]n\s+|el\s+libro\s+|el\s+|la\s+)?(.+?)(?:\s+con\s+nota|\s+en\s+la\s+b[oó]veda|\s+a\s+la\s+b[oó]veda|\s+a\s+mi\s+m[uú]sica|\s+en\s+mi\s+b[oó]veda|$)/i
      );
      if (genericVerbMatch && genericVerbMatch[1]) {
        const rawCandidate = cleanExtractedTitle(genericVerbMatch[1]);
        const deSplit = isMusicIntent
          ? rawCandidate.match(/^(.+?)\s+de\s+([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ\s.&\-]{2,35})$/i)
          : null;
        if (deSplit) {
          title = cleanExtractedTitle(deSplit[1]);
          creator = cleanExtractedTitle(deSplit[2]);
        } else {
          title = rawCandidate;
        }
      }
    }

    if (!title && imdbIdMatch) {
      title = imdbIdMatch[1];
    }
    if (!title) {
      title = 'Nueva Experiencia';
    }

    actions.push({
      name: 'addVaultItem',
      args: {
        title: title.charAt(0).toUpperCase() + title.slice(1),
        vaultGroup,
        category,
        creator: creator || undefined,
        rating,
        tier,
        tags: isMusicIntent
          ? ['Spotify', 'Música']
          : [category, 'Destacado'],
        review: '',
        imdbId: imdbIdMatch ? imdbIdMatch[1].toLowerCase() : undefined,
      },
    });
  }

  // ==========================================================================
  // 4. WISHLIST & SAVINGS POOL
  // ==========================================================================
  const priceMatch =
    trimmed.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)/) ||
    trimmed.match(/(\d+)\s*(?:usd|dólares|dolares)/i);
  if (
    lower.includes('wishlist') ||
    lower.includes('presupuesto') ||
    lower.includes('fondo de ahorro') ||
    lower.includes('ahorro disponible')
  ) {
    const amount = priceMatch
      ? parseFloat(priceMatch[1].replace(/,/g, ''))
      : 200;
    if (
      lower.includes('fondo') ||
      lower.includes('presupuesto') ||
      lower.includes('ahorro disponible')
    ) {
      actions.push({
        name: 'manageWishlist',
        args: {
          actionType: 'update_savings_pool',
          extraSavingsPool: amount,
        },
      });
    } else {
      const quoted = trimmed.match(/["'«“]([^"'»”]+)["'»”]/);
      let name = quoted ? quoted[1].trim() : 'Meta de Wishlist';
      if (!quoted) {
        const itemMatch = trimmed.match(
          /(?:agrega|añade|guardar|comprar)\s+(?:el\s+|la\s+|un\s+|una\s+|unas\s+)?([A-Za-z0-9ÁÉÍÓÚáéíóúñÑ\-\s]{3,35}?)(?:\s+a\s+mi|\s+en\s+la|\s+por\s+\$|\s+de\s+\$|,|$)/i
        );
        if (itemMatch && itemMatch[1]) name = itemMatch[1].trim();
      }
      const isSportItem =
        lower.includes('zapatilla') ||
        lower.includes('balón') ||
        lower.includes('básquet') ||
        lower.includes('fútbol');

      actions.push({
        name: 'manageWishlist',
        args: {
          actionType: 'add_product',
          name: name.charAt(0).toUpperCase() + name.slice(1),
          estimatedPrice: amount,
          savedAmount: 0,
          priority: lower.includes('alta') ? 'Alta' : 'Media',
          wishlistTag: isSportItem ? 'Deporte / Básquet & Fútbol' : 'Tech',
        },
      });
    }
  }

  // ==========================================================================
  // 5. GOOGLE TASKS
  // ==========================================================================
  if (
    lower.includes('tarea') ||
    lower.includes('google tasks') ||
    lower.includes('pendiente:')
  ) {
    let title = trimmed;
    const quoted = trimmed.match(/["'«“]([^"'»”]+)["'»”]/);
    if (quoted) {
      title = quoted[1].trim();
    } else {
      const m = trimmed.match(/(?:tarea|pendiente)\s*[:\-]?\s*(.+)$/i);
      if (m && m[1]) title = m[1].trim();
    }
    actions.push({
      name: 'createGoogleTask',
      args: {
        title: title.charAt(0).toUpperCase() + title.slice(1),
        notes: 'Creada desde Aether Assistant',
      },
    });
  }

  return actions;
}

export interface CuratedRecommendationSeed {
  id: string;
  title: string;
  creator: string;
  year: string;
  category: 'Cine' | 'Serie' | 'Música';
  vaultGroup: 'peliculas_series' | 'musica';
  imdbId?: string;
  imdbRating?: string;
  imageUrl?: string;
  spotifyUrl?: string;
  tags: string[];
  affinityKeywords: string[];
  plot: string;
  baseReason: string;
}

const CURATED_RECOMMENDATION_POOL: CuratedRecommendationSeed[] = [
  {
    id: 'rec-arrival',
    title: 'La Llegada (Arrival)',
    creator: 'Denis Villeneuve',
    year: '2016',
    category: 'Cine',
    vaultGroup: 'peliculas_series',
    imdbId: 'tt2543164',
    imdbRating: '7.9',
    imageUrl:
      'https://m.media-amazon.com/images/M/MV5BMTExMzU0ODcxNDheQTJeQWpwZ15BbWU4MDE1OTI4MzAy._V1_SX300.jpg',
    tags: ['Ciencia Ficción', 'Drama', 'Filosófica'],
    affinityKeywords: [
      'sci-fi',
      'ciencia ficción',
      'dune',
      'interstellar',
      'villeneuve',
      'nolan',
      'espacio',
      'filosofía',
      'drama',
    ],
    plot: 'Cuando misteriosas naves espaciales aterrizan en todo el mundo, una lingüista de élite intenta descifrar su idioma antes de que estalle una guerra global.',
    baseReason:
      'Comparte la atmósfera hipnótica, emocional y de ciencia ficción profunda de tus obras favoritas.',
  },
  {
    id: 'rec-bladerunner-2049',
    title: 'Blade Runner 2049',
    creator: 'Denis Villeneuve',
    year: '2017',
    category: 'Cine',
    vaultGroup: 'peliculas_series',
    imdbId: 'tt1856101',
    imdbRating: '8.0',
    imageUrl:
      'https://m.media-amazon.com/images/M/MV5BNzA1Njg4NzYxOV5BMl5BanBnXkFtZTgwODk5NjU3MzI@._V1_SX300.jpg',
    tags: ['Cyberpunk', 'Sci-Fi', 'Neo-Noir'],
    affinityKeywords: [
      'cyberpunk',
      'sci-fi',
      'ciencia ficción',
      'dune',
      'matrix',
      'thriller',
      'estética',
      'futurista',
    ],
    plot: 'El descubrimiento de un secreto enterrado durante mucho tiempo lleva a un joven Blade Runner a buscar a Rick Deckard, desaparecido hace treinta años.',
    baseReason:
      'Su estética visual y narrativa introspectiva conectan directamente con el cine de autor y ciencia ficción de tu Bóveda.',
  },
  {
    id: 'rec-severance',
    title: 'Severance (Separación)',
    creator: 'Dan Erickson · Ben Stiller',
    year: '2022',
    category: 'Serie',
    vaultGroup: 'peliculas_series',
    imdbId: 'tt11280740',
    imdbRating: '8.7',
    imageUrl:
      'https://m.media-amazon.com/images/M/MV5BMjkwZjcwMGQtNDAzOC00YjJiLThiYTgtNWU3ZjRiZmY2YzEzXkEyXkFqcGdeQXVyMTMzNDExODE5._V1_SX300.jpg',
    tags: ['Thriller Psicológico', 'Sci-Fi', 'Misterio'],
    affinityKeywords: [
      'serie',
      'thriller',
      'misterio',
      'sci-fi',
      'psicológico',
      'dark',
      'black mirror',
      'mind-bending',
    ],
    plot: 'Mark lidera un equipo de oficinistas cuyos recuerdos han sido divididos quirúrgicamente entre su vida laboral y su vida personal.',
    baseReason:
      'Ideal por tu afinidad con historias de misterio inteligente, tensión psicológica y diseño minimalista.',
  },
  {
    id: 'rec-steins-gate',
    title: 'Steins;Gate',
    creator: 'White Fox · Hiroshi Hamasaki',
    year: '2011',
    category: 'Serie',
    vaultGroup: 'peliculas_series',
    imdbId: 'tt1910272',
    imdbRating: '8.8',
    imageUrl:
      'https://m.media-amazon.com/images/M/MV5BMjUxMzE4ZDctODNjMS00MzIwLThjNDktODkwYjc5YWU0MDc0XkEyXkFqcGdeQXVyNjc3OTE4Nzk@._V1_SX300.jpg',
    tags: ['Anime', 'Viajes en el Tiempo', 'Sci-Fi'],
    affinityKeywords: [
      'anime',
      'frieren',
      'attack on titan',
      'sci-fi',
      'tiempo',
      'interstellar',
      'animación',
      'japonés',
    ],
    plot: 'Un grupo de amigos descubre accidentalmente un método para enviar mensajes al pasado, alterando de forma impredecible la línea temporal.',
    baseReason:
      'Combina la emoción del mejor anime con una trama brillante de paradojas temporales al estilo Interstellar.',
  },
  {
    id: 'rec-whiplash',
    title: 'Whiplash: Música y Obsesión',
    creator: 'Damien Chazelle',
    year: '2014',
    category: 'Cine',
    vaultGroup: 'peliculas_series',
    imdbId: 'tt2582802',
    imdbRating: '8.5',
    imageUrl:
      'https://m.media-amazon.com/images/M/MV5BOTA5NDZlZGUtMjAxOS00YTRkLTkwYmMtYWQ0NWEwZDZiNjEzXkEyXkFqcGdeQXVyMTMxODk2OTU@._V1_SX300.jpg',
    tags: ['Drama', 'Música', 'Superación'],
    affinityKeywords: [
      'música',
      'drama',
      'disciplina',
      'ritmo',
      'cine',
      'intensidad',
    ],
    plot: 'Un joven y prometedor baterista de jazz se inscribe en un implacable conservatorio donde su mentor lo lleva al límite de su capacidad.',
    baseReason:
      'Por tu enfoque en la maestría de habilidades y tu gusto por el cine intenso y musicalmente impecable.',
  },
  {
    id: 'rec-currents-tame-impala',
    title: 'Currents',
    creator: 'Tame Impala',
    year: '2015',
    category: 'Música',
    vaultGroup: 'musica',
    imageUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/a6/22/85/a6228545-85a4-02d5-39b9-68482442c44d/15UMGIM23322.rgb.jpg/600x600bb.jpg',
    spotifyUrl: 'https://open.spotify.com/search/Currents%20Tame%20Impala',
    tags: ['Synth-Pop', 'Psicodélico', 'Deep Work'],
    affinityKeywords: [
      'daft punk',
      'synth',
      'electrónica',
      'música',
      'álbum',
      'indie',
      'focus',
      'the weeknd',
      'm83',
    ],
    plot: 'Álbum icónico de sintetizadores analógicos, bajos magnéticos y texturas psicodélicas modernas producidas por Kevin Parker.',
    baseReason:
      'Encaja a la perfección con los sintetizadores envolventes y la vibra electrónica de tu colección musical.',
  },
  {
    id: 'rec-hurry-up-tomorrow-m83',
    title: 'Hurry Up, We’re Dreaming',
    creator: 'M83',
    year: '2011',
    category: 'Música',
    vaultGroup: 'musica',
    imageUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/78/42/e9/7842e940-8b27-573e-970f-5b3f8a6e2d31/886443157941.jpg/600x600bb.jpg',
    spotifyUrl:
      'https://open.spotify.com/search/Hurry%20Up%20We%20Are%20Dreaming%20M83',
    tags: ['Dream Pop', 'Cinematográfico', 'Synthwave'],
    affinityKeywords: [
      'música',
      'álbum',
      'synthwave',
      'electrónica',
      'nocturno',
      'épico',
      'soundtrack',
      'hans zimmer',
    ],
    plot: 'Obra maestra del synth-pop cinematográfico que incluye "Midnight City", ideal para sesiones creativas o nocturnas.',
    baseReason:
      'Une el sonido épico de banda sonora cinematográfica con la energía electrónica de tu Bóveda.',
  },
  {
    id: 'rec-tron-legacy-ost',
    title: 'TRON: Legacy (Original Motion Picture Soundtrack)',
    creator: 'Daft Punk',
    year: '2010',
    category: 'Música',
    vaultGroup: 'musica',
    imageUrl:
      'https://is1-ssl.mzstatic.com/image/thumb/Music125/v4/6b/68/97/6b68971a-39f9-2633-72c0-18952e3a6b60/00050087239640.rgb.jpg/600x600bb.jpg',
    spotifyUrl: 'https://open.spotify.com/search/Tron%20Legacy%20Daft%20Punk',
    tags: ['Orquestal', 'Electrónica', 'Sci-Fi Score'],
    affinityKeywords: [
      'daft punk',
      'hans zimmer',
      'sci-fi',
      'cyberpunk',
      'soundtrack',
      'deep work',
      'programación',
    ],
    plot: 'Fusión magistral entre una orquesta sinfónica de 85 músicos y los sintetizadores futuristas de Daft Punk.',
    baseReason:
      'Combina tu gusto por la ciencia ficción visual con el sonido electrónico y orquestal para concentrarte al máximo.',
  },
];

export function isRecommendationIntent(prompt: string): boolean {
  const lower = prompt.trim().toLowerCase();
  if (!lower) return false;
  return (
    lower.includes('recomiend') ||
    lower.includes('recomendaci') ||
    lower.includes('sugier') ||
    lower.includes('sugerencia') ||
    lower.includes('qué ver') ||
    lower.includes('que ver') ||
    lower.includes('qué escuchar') ||
    lower.includes('que escuchar') ||
    lower.includes('qué película me') ||
    lower.includes('que pelicula me') ||
    lower.includes('qué serie me') ||
    lower.includes('que serie me') ||
    lower.includes('qué música me') ||
    lower.includes('que musica me') ||
    lower.includes('algo parecido a') ||
    lower.includes('similar a mi bóveda') ||
    lower.includes('según mi bóveda') ||
    lower.includes('segun mi boveda') ||
    lower.includes('según mis gustos') ||
    lower.includes('segun mis gustos')
  );
}

export function generateVaultBasedRecommendations(
  prompt: string,
  vaultItems: any[] = []
): {
  replyText: string;
  recommendations: Array<{
    id: string;
    title: string;
    creator: string;
    year?: string;
    category: 'Cine' | 'Serie' | 'Música';
    vaultGroup: 'peliculas_series' | 'musica';
    imdbId?: string;
    imdbRating?: string;
    imageUrl?: string;
    spotifyUrl?: string;
    tags: string[];
    plot?: string;
    reason: string;
  }>;
} {
  const lower = prompt.toLowerCase();
  const wantsOnlyMusic =
    (lower.includes('música') ||
      lower.includes('musica') ||
      lower.includes('canción') ||
      lower.includes('cancion') ||
      lower.includes('álbum') ||
      lower.includes('album') ||
      lower.includes('escuchar') ||
      lower.includes('spotify')) &&
    !lower.includes('película') &&
    !lower.includes('pelicula') &&
    !lower.includes('serie') &&
    !lower.includes('cine') &&
    !lower.includes('ver');

  const wantsOnlyVisual =
    (lower.includes('película') ||
      lower.includes('pelicula') ||
      lower.includes('serie') ||
      lower.includes('anime') ||
      lower.includes('cine') ||
      lower.includes('ver')) &&
    !lower.includes('música') &&
    !lower.includes('musica') &&
    !lower.includes('escuchar') &&
    !lower.includes('álbum');

  const existingTitles = new Set(
    (vaultItems || []).map((v) =>
      String(v.title || '')
        .toLowerCase()
        .trim()
    )
  );

  // Extract top titles and favorite tags from the user's Vault
  const topVaultMovies = (vaultItems || []).filter(
    (v) =>
      v.vaultGroup === 'peliculas_series' || v.vaultGroup === 'proximamente'
  );
  const topVaultMusic = (vaultItems || []).filter(
    (v) => v.vaultGroup === 'musica'
  );

  const allVaultTokens: string[] = [];
  const favoriteTitlesSample: string[] = [];
  const favoriteGenresSet = new Set<string>();

  (vaultItems || []).forEach((v) => {
    if (v.title) {
      allVaultTokens.push(String(v.title).toLowerCase());
      if (
        (v.tier === 'S' || Number(v.rating || 0) >= 8.8) &&
        favoriteTitlesSample.length < 3
      ) {
        favoriteTitlesSample.push(v.title);
      }
    }
    if (v.creator) allVaultTokens.push(String(v.creator).toLowerCase());
    if (Array.isArray(v.tags)) {
      v.tags.forEach((t: string) => {
        allVaultTokens.push(String(t).toLowerCase());
        if (favoriteGenresSet.size < 4) favoriteGenresSet.add(t);
      });
    }
  });

  const vaultCorpus = allVaultTokens.join(' ');
  const refMovieTitle =
    topVaultMovies[0]?.title || favoriteTitlesSample[0] || null;
  const refMusicTitle = topVaultMusic[0]?.title || null;
  const genreSummary =
    Array.from(favoriteGenresSet).slice(0, 3).join(', ') ||
    'Ciencia Ficción, Drama y Electrónica';

  // Filter out anything already in the user's Vault
  const availablePool = CURATED_RECOMMENDATION_POOL.filter(
    (seed) =>
      !existingTitles.has(seed.title.toLowerCase()) &&
      !Array.from(existingTitles).some(
        (saved) =>
          saved.length > 3 && seed.title.toLowerCase().includes(saved)
      )
  );

  const scoredPool = availablePool
    .map((seed) => {
      let score = 10;
      seed.affinityKeywords.forEach((kw) => {
        if (vaultCorpus.includes(kw)) score += 6;
        if (lower.includes(kw)) score += 12;
      });
      if (wantsOnlyMusic && seed.vaultGroup === 'musica') score += 30;
      if (wantsOnlyVisual && seed.vaultGroup === 'peliculas_series') score += 30;
      if (lower.includes('anime') && seed.tags.includes('Anime')) score += 25;
      if (lower.includes('serie') && seed.category === 'Serie') score += 20;
      return { seed, score };
    })
    .sort((a, b) => b.score - a.score);

  let selectedSeeds: CuratedRecommendationSeed[] = [];
  if (wantsOnlyMusic) {
    selectedSeeds = scoredPool
      .filter((s) => s.seed.vaultGroup === 'musica')
      .slice(0, 3)
      .map((s) => s.seed);
  } else if (wantsOnlyVisual) {
    selectedSeeds = scoredPool
      .filter((s) => s.seed.vaultGroup === 'peliculas_series')
      .slice(0, 3)
      .map((s) => s.seed);
  } else {
    const bestVisual = scoredPool
      .filter((s) => s.seed.vaultGroup === 'peliculas_series')
      .slice(0, 2)
      .map((s) => s.seed);
    const bestMusic = scoredPool
      .filter((s) => s.seed.vaultGroup === 'musica')
      .slice(0, 1)
      .map((s) => s.seed);
    selectedSeeds = [...bestVisual, ...bestMusic];
  }

  if (selectedSeeds.length === 0) {
    selectedSeeds = CURATED_RECOMMENDATION_POOL.slice(0, 3);
  }

  const recommendations = selectedSeeds.map((seed) => {
    let personalizedReason = seed.baseReason;
    if (seed.vaultGroup === 'peliculas_series' && refMovieTitle) {
      personalizedReason = `Basado en "${refMovieTitle}" de tu Bóveda: ${seed.baseReason.charAt(0).toLowerCase()}${seed.baseReason.slice(1)}`;
    } else if (seed.vaultGroup === 'musica' && refMusicTitle) {
      personalizedReason = `En sintonía con "${refMusicTitle}" en tu Bóveda: ${seed.baseReason.charAt(0).toLowerCase()}${seed.baseReason.slice(1)}`;
    }
    return {
      id: seed.id,
      title: seed.title,
      creator: seed.creator,
      year: seed.year,
      category: seed.category,
      vaultGroup: seed.vaultGroup,
      imdbId: seed.imdbId,
      imdbRating: seed.imdbRating,
      imageUrl: seed.imageUrl,
      spotifyUrl: seed.spotifyUrl,
      tags: seed.tags,
      plot: seed.plot,
      reason: personalizedReason,
    };
  });

  const historyIntro =
    favoriteTitlesSample.length > 0
      ? `He analizado tu Bóveda (${vaultItems.length} registros, destacando **${favoriteTitlesSample.join(
          '**, **'
        )}** y tus géneros clave: *${genreSummary}*).`
      : `He analizado el perfil estético de tu Bóveda (*${genreSummary}*).`;

  const bulletLines = recommendations
    .map(
      (r, idx) =>
        `${idx + 1}. **${r.title}** (${r.year || r.category} · ${
          r.creator
        }) — ${r.reason}`
    )
    .join('\n');

  const replyText = `${historyIntro}\n\nAquí tienes mis recomendaciones personalizadas para hoy:\n${bulletLines}\n\n¿Te llama la atención alguna? Puedes guardarla con un toque en su tarjeta o decirme directamente: **"Guárdala en la Bóveda"** o **"Agrégala al Hype Radar"**.`;

  return {
    replyText,
    recommendations,
  };
}

export function parseRecommendationFollowUp(
  prompt: string,
  recentRecommendations: Array<{
    id: string;
    title: string;
    creator: string;
    year?: string;
    category: string;
    vaultGroup: string;
    imdbId?: string;
    imdbRating?: string;
    imageUrl?: string;
    spotifyUrl?: string;
    tags: string[];
    plot?: string;
    reason?: string;
  }> = []
): ParsedAssistantAction[] {
  if (!recentRecommendations || recentRecommendations.length === 0) return [];
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  const isSaveFollowUp =
    /(?:gu[aá]rdal[ao]s?|agr[eé]gal[ao]s?|a[nñ][aá]del[ao]s?|ponl[ao]s?|registra\s+esa|guarda\s+esa|guarda\s+la\s+recomendaci[oó]n|agrega\s+la\s+recomendaci[oó]n|guarda\s+la\s+primera|guarda\s+la\s+segunda|guarda\s+la\s+tercera|agrega\s+la\s+primera|agrega\s+la\s+segunda|agrega\s+la\s+tercera)/i.test(
      lower
    ) ||
    ((lower.includes('bóveda') ||
      lower.includes('boveda') ||
      lower.includes('hype radar') ||
      lower.includes('próximamente') ||
      lower.includes('proximamente')) &&
      recentRecommendations.some((r) =>
        lower.includes(r.title.toLowerCase().split('(')[0].trim())
      ));

  if (!isSaveFollowUp) return [];

  const wantsHypeRadar =
    lower.includes('hype radar') ||
    lower.includes('próximamente') ||
    lower.includes('proximamente') ||
    lower.includes('en espera') ||
    lower.includes('estreno');

  let matchedRecs = recentRecommendations.filter((r) => {
    const cleanRecTitle = r.title.toLowerCase().split('(')[0].trim();
    return cleanRecTitle.length > 2 && lower.includes(cleanRecTitle);
  });

  if (matchedRecs.length === 0) {
    if (lower.includes('segunda') && recentRecommendations[1]) {
      matchedRecs = [recentRecommendations[1]];
    } else if (lower.includes('tercera') && recentRecommendations[2]) {
      matchedRecs = [recentRecommendations[2]];
    } else if (
      (lower.includes('música') ||
        lower.includes('musica') ||
        lower.includes('álbum') ||
        lower.includes('album') ||
        lower.includes('canción')) &&
      recentRecommendations.some((r) => r.vaultGroup === 'musica')
    ) {
      matchedRecs = [
        recentRecommendations.find((r) => r.vaultGroup === 'musica')!,
      ];
    } else if (
      lower.includes('todas') ||
      lower.includes('guárdalas') ||
      lower.includes('guardalas') ||
      lower.includes('agrégalas') ||
      lower.includes('agregalas')
    ) {
      matchedRecs = recentRecommendations;
    } else {
      matchedRecs = [recentRecommendations[0]];
    }
  }

  return matchedRecs.map((rec) => {
    const targetGroup = wantsHypeRadar
      ? 'proximamente'
      : (rec.vaultGroup as any) || 'peliculas_series';
    const targetCategory = wantsHypeRadar
      ? 'Próximamente'
      : rec.category || 'Cine';

    return {
      name: 'addVaultItem' as const,
      args: {
        title: rec.title,
        creator: rec.creator,
        vaultGroup: targetGroup,
        category: targetCategory,
        rating: 9.5,
        tier: 'S',
        tags: rec.tags || [targetCategory, 'Recomendación IA'],
        review: rec.plot || rec.reason || 'Recomendada por Aether Assistant.',
        plot: rec.plot,
        imdbId: rec.imdbId,
        imdbRating: rec.imdbRating,
        imageUrl: rec.imageUrl,
        releaseYear: rec.year,
        skipConfirmation: true,
      },
    };
  });
}

export function buildContextualReply(actions: ParsedAssistantAction[]): string {
  if (!actions || actions.length === 0) {
    return '¡Hola! Puedo analizar tu Bóveda para recomendarte películas, series o música según tus gustos, guardar contenidos en tu Bóveda o Hype Radar, registrar prácticas en tus Habilidades o agendar eventos en tu Calendario.';
  }

  const summaries = actions.map((act) => {
    const a = act.args || {};
    if (act.name === 'addVaultItem') {
      if (a.vaultGroup === 'musica') {
        return `¡Listo! He añadido **${a.title}**${
          a.creator ? ` de ${a.creator}` : ''
        } a tu sección de Música en la Bóveda con su carátula oficial y enlace directo a Spotify.`;
      }
      if (a.vaultGroup === 'proximamente') {
        return `¡Listo! He registrado **${a.title}** en tu **Hype Radar (Próximamente)** dentro de la Bóveda.`;
      }
      return `¡Listo, guardado en tu Bóveda! He registrado **${a.title}** con calificación **${
        a.rating ?? 9.5
      }/10 (Tier ${a.tier || 'S'})** y sus metadatos oficiales.`;
    }
    if (act.name === 'updateOrCreateSkill') {
      return `¡Excelente entrenamiento! He registrado tu práctica en **${
        a.skillName
      }** (${a.durationLabel || `${a.hoursToAdd}h`}${
        a.sportStats ? ` · ${a.sportStats}` : ` · +${a.progressDelta || 15} XP`
      }) directamente en tu Árbol de Habilidades RPG.`;
    }
    if (act.name === 'scheduleCalendarEvent') {
      return `¡Agendado! He programado **${a.title}** para **${
        a.dayLabel || `el día ${a.dayOfMonth}`
      }** en el horario **${a.timeRange}** en tu Calendario.`;
    }
    if (act.name === 'manageWishlist') {
      if (a.actionType === 'update_savings_pool') {
        return `¡Hecho! He actualizado tu Fondo de Ahorro Disponible a **$${a.extraSavingsPool} USD**.`;
      }
      return `¡Listo! He añadido **${a.name}** ($${a.estimatedPrice} USD) a tu Wishlist.`;
    }
    if (act.name === 'createGoogleTask') {
      return `¡Listo! He creado la tarea pendiente **${a.title}** en Google Tasks.`;
    }
    return '¡Acción completada y sincronizada!';
  });

  return summaries.join(' ');
}
