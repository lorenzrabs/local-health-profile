export type IsoDate = string;
export type IsoDateTime = string;

export type HealthSampleInput = {
  sourceId: string;
  type: HealthSampleType;
  unit: string;
  value: number;
  startAt: IsoDateTime;
  endAt: IsoDateTime;
  sourceName?: string;
  metadata?: Record<string, unknown>;
};

export type HealthSampleType =
  | "heartRate"
  | "restingHeartRate"
  | "heartRateVariabilitySDNN"
  | "stepCount"
  | "distanceWalkingRunning"
  | "activeEnergyBurned"
  | "basalEnergyBurned"
  | "vo2Max"
  | "sleepAnalysis"
  | "mindfulSession";

export type WorkoutInput = {
  sourceId: string;
  activityType: string;
  startAt: IsoDateTime;
  endAt: IsoDateTime;
  durationSeconds: number;
  distanceMeters?: number | null;
  activeEnergyKcal?: number | null;
  averageHeartRate?: number | null;
  metadata?: Record<string, unknown>;
};

export type HealthKitSyncPayload = {
  deviceName?: string;
  samples: HealthSampleInput[];
  workouts: WorkoutInput[];
};

export type DailyCheckInInput = {
  date: IsoDate;
  cigarettes?: number;
  painAreas?: string[];
  energy?: number;
  soreness?: number;
  perceivedRecovery?: number;
  sleepQuality?: number;
  proteinOk?: boolean;
  creatineTaken?: boolean;
  inulinTaken?: boolean;
  broccoliOrCruciferous?: boolean;
  lentilsOrLegumes?: boolean;
  hydrationOk?: boolean;
  plannedTraining?: string;
  notes?: string;
};

export type DailyCheckIn = Required<
  Pick<
    DailyCheckInInput,
    | "date"
    | "cigarettes"
    | "painAreas"
    | "energy"
    | "soreness"
    | "perceivedRecovery"
    | "sleepQuality"
    | "proteinOk"
    | "creatineTaken"
    | "inulinTaken"
    | "broccoliOrCruciferous"
    | "lentilsOrLegumes"
    | "hydrationOk"
    | "plannedTraining"
    | "notes"
  >
>;

export type DashboardAction =
  | "train"
  | "easy_run"
  | "mobility"
  | "recovery"
  | "nutrition_focus"
  | "smoking_reduction_focus";

export type DashboardMetric = {
  label: string;
  value: string;
  detail?: string;
  status: "good" | "neutral" | "watch";
};

export type RestingHeartRateCoach = {
  status: "missing" | "best_phase" | "recovered" | "stable" | "elevated" | "high";
  statusLabel: string;
  latest: number | null;
  latestDate: IsoDate | null;
  sevenDaySampleDays: number;
  baselineSampleDays: number;
  history: TrendPoint[];
  sevenDayAverage: number | null;
  baseline28DayAverage: number | null;
  ninetyDayAverage: number | null;
  bestSevenDayAverage: number | null;
  deltaFromBaseline: number | null;
  deltaFromBest: number | null;
  trend90DayDelta: number | null;
  normalZone: { low: number; high: number } | null;
  summary: string;
  actions: string[];
  drivers: string[];
};

export type HeartRateZone = {
  id: "warmup" | "recovery" | "aerobic" | "steady" | "threshold" | "vo2max";
  label: string;
  low: number | null;
  high: number | null;
  description: string;
  guidance: string;
  sampleShare: number | null;
};

export type HeartRateZones = {
  method: "heart_rate_reserve";
  restingHeartRate: number | null;
  estimatedMaxHeartRate: number | null;
  heartRateReserve: number | null;
  observedPeak: number | null;
  sustainedPeak60s: number | null;
  runCount: number;
  sampleCount: number;
  confidence: "low" | "medium" | "high";
  summary: string;
  zones: HeartRateZone[];
};

export type DashboardToday = {
  date: IsoDate;
  readinessScore: number;
  primaryAction: DashboardAction;
  headline: string;
  summary: string;
  riskFlags: string[];
  reasons: string[];
  actions: string[];
  metrics: DashboardMetric[];
  restingHeartRateCoach: RestingHeartRateCoach;
  heartRateZones: HeartRateZones;
  checkIn: DailyCheckIn | null;
  habits: HabitDay;
  lastAiRecommendation: AiRecommendation | null;
};

export type AiRecommendation = {
  id: number;
  date: IsoDate;
  model: string;
  recommendation: {
    headline: string;
    actions: string[];
    notes: string[];
  };
  createdAt: IsoDateTime;
};

export type PairingResponse = {
  serverUrl: string;
  token: string;
  expiresAt: IsoDateTime;
  pairingUrl: string;
  qrDataUrl: string;
};

export type HabitDefinition = {
  id: number;
  clientId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  updatedAt: IsoDateTime;
};

export type HabitEntry = {
  habitId: number;
  habitClientId: string;
  date: IsoDate;
  completed: boolean;
  updatedAt: IsoDateTime;
};

export type HabitDay = {
  date: IsoDate;
  definitions: HabitDefinition[];
  entries: HabitEntry[];
  completedCount: number;
  totalCount: number;
  completionRate: number;
};

export type HabitDefinitionSyncInput = {
  id?: number;
  clientId?: string;
  name: string;
  sortOrder?: number;
  isActive?: boolean;
  updatedAt?: IsoDateTime;
};

export type HabitEntrySyncInput = {
  habitId?: number;
  habitClientId?: string;
  date: IsoDate;
  completed: boolean;
  updatedAt?: IsoDateTime;
};

export type HabitSyncPayload = {
  since?: IsoDateTime;
  definitions?: HabitDefinitionSyncInput[];
  entries?: HabitEntrySyncInput[];
};

export type HabitSyncResponse = {
  syncedAt: IsoDateTime;
  definitions: HabitDefinition[];
  entries: HabitEntry[];
};

export type HabitAnalysisWeekday = {
  weekday: number;
  label: string;
  eventDays: number;
  totalDays: number;
  eventRate: number;
};

export type HabitAnalysisItem = {
  habitId: number;
  clientId: string;
  name: string;
  isActive: boolean;
  trackedDays: number;
  missingDays: number;
  nonEventDays: number;
  inferredDays: number;
  recentRate: number | null;
  previousRate: number | null;
  recentTrackedDays: number;
  previousTrackedDays: number;
  eventDays: number;
  trackingRate: number;
  eventRate: number;
  currentStreak: number;
  longestStreak: number;
  lastEventDate: IsoDate | null;
  weekdays: HabitAnalysisWeekday[];
};

export type HabitCorrelationMetric =
  | "resting_hr"
  | "hrv"
  | "sleep"
  | "steps"
  | "active_energy"
  | "running_distance";

export type HabitCorrelation = {
  habitClientId: string;
  habitName: string;
  metric: HabitCorrelationMetric;
  metricLabel: string;
  unit: string;
  timing: "sameDay" | "nextDay";
  eventDays: number;
  comparisonDays: number;
  inferredComparisonDays?: number;
  eventMedian: number | null;
  comparisonMedian: number | null;
  confidence: "exploratory" | "more_data";
  eventAverage: number | null;
  comparisonAverage: number | null;
  delta: number | null;
  summary: string;
  quality: "ok" | "insufficient";
};

export type MindfulnessSummary = {
  days: { date: string; minutes: number }[];
  totalMinutes: number;
  source: "appleHealth";
};

export type HabitAnalysis = {
  comparisonMode: "explicit" | "trackedDays";
  mindfulness: MindfulnessSummary;
  date: IsoDate;
  rangeDays: 30 | 90 | 365;
  startDate: IsoDate;
  endDate: IsoDate;
  generatedAt: IsoDateTime;
  lastTrackedDate: IsoDate | null;
  recordedDays: number;
  minimumGroupSize: number;
  totalDays: number;
  items: HabitAnalysisItem[];
  correlations: HabitCorrelation[];
  notes: string[];
};

export type RecipeItem = {
  name: string;
  amount: number;
  unit: string;
  excludeFromNutrition: boolean;
};

export type RecipeNutrientCategory = "macro" | "micro";

export type RecipeNutrient = {
  key: string;
  label: string;
  amount: number;
  unit: string;
  category: RecipeNutrientCategory;
};

export type RecipeScaledItem = RecipeItem & {
  totalAmount: number;
};

export type RecipeScaledNutrient = RecipeNutrient & {
  totalAmount: number;
};

export type Recipe = {
  id: number;
  name: string;
  category: string;
  instructions: string;
  prepNotes: string;
  servingBase: number;
  items: RecipeItem[];
  nutrientsPerServing: RecipeNutrient[];
  servingsApplied: number;
  scaledItems: RecipeScaledItem[];
  scaledNutrients: RecipeScaledNutrient[];
};

export type ShoppingListExportItem = {
  id: string;
  name: string;
  amount?: number;
  unit?: string;
  category?: string;
  note?: string;
  sourceRecipeNames?: string[];
};

export type ShoppingListSourceSnapshot = {
  generatedAt?: IsoDateTime;
  recipes: Array<{
    id: number | string;
    name: string;
    portions: number;
  }>;
};

export type ShoppingListExport = {
  id: string;
  title: string;
  items: ShoppingListExportItem[];
  sourceSnapshot?: ShoppingListSourceSnapshot | Record<string, unknown>;
  createdAt: IsoDateTime;
  consumedAt: IsoDateTime | null;
  error?: Record<string, unknown> | null;
};

export type ShoppingListExportCreateInput = {
  title: string;
  items: ShoppingListExportItem[];
  sourceSnapshot?: ShoppingListSourceSnapshot | Record<string, unknown>;
};

export type TrendPoint = {
  date: IsoDate;
  value: number | null;
};

export type TrendDirection = "up_good" | "down_good" | "neutral";

export type TrendCard = {
  id: "running" | "vo2max" | "resting_hr" | "hrv" | "sleep" | "activity";
  title: string;
  value: string;
  detail: string;
  interpretation?: string;
  deltaLabel: string;
  direction: TrendDirection;
  status: "good" | "neutral" | "watch";
  points: TrendPoint[];
};

export type TrendDashboard = {
  rangeDays: 30 | 90 | 365;
  generatedAt: IsoDateTime;
  cards: TrendCard[];
};
