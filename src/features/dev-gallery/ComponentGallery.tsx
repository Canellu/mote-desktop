import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, type buttonVariants } from "@/components/ui/button";
import { SensorReadingPill } from "@/components/SensorReadingPill";
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "@/components/ui/button-group";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";
import {
  Bell,
  Check,
  CircleAlert,
  CircleCheck,
  Copy,
  Heart,
  Info,
  Lightbulb,
  Mail,
  Moon,
  Plus,
  Settings,
  Sun,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AutomationsDemo } from "./AutomationsDemo";
import { FocusDemo } from "./FocusDemo";
import { PresenceDemo } from "./PresenceDemo";
import { CalendarDemo } from "./CalendarDemo";

type ButtonVariant = NonNullable<
  VariantProps<typeof buttonVariants>["variant"]
>;

const BUTTON_VARIANTS: ButtonVariant[] = [
  "default",
  "outline",
  "secondary",
  "ghost",
  "destructive",
  "link",
];

const BUTTON_TEXT_SIZES = ["sm", "default", "lg", "xl"] as const;
const BUTTON_ICON_SIZES = ["icon-sm", "icon", "icon-lg", "icon-xl"] as const;

const BADGE_VARIANTS = [
  "default",
  "secondary",
  "destructive",
  "outline",
  "ghost",
  "link",
] as const;

const BATTERY_LEVELS = [0, 1, 20, 21, 49, 50, 51, 75, 99, 100] as const;

/**
 * Surface tokens from App.css, grouped by role:
 *   - Neutral ladder: a monotonic elevation stack (lighter = higher) that holds
 *     direction in both themes. `shadow` adds the lift cue light mode needs.
 *   - Semantic fills: primary/secondary/muted/accent — secondary/muted/accent
 *     intentionally share a fill; the distinction is the foreground token.
 *   - Status surfaces: the destructive/info/warn/success feedback family. warn
 *     is light amber, so it carries a dark foreground while the rest use white.
 * `fg` is a ready-to-use CSS color.
 */
const NEUTRAL_SURFACES = [
  {
    name: "background",
    role: "base",
    fill: "--background",
    fg: "var(--foreground)",
    shadow: "none",
  },
  {
    name: "card",
    role: "container",
    fill: "--card",
    fg: "var(--card-foreground)",
    shadow: "sm",
  },
  {
    name: "tile",
    role: "raised content",
    fill: "--tile",
    fg: "var(--foreground)",
    shadow: "sm",
  },
  {
    name: "popover",
    role: "floating",
    fill: "--popover",
    fg: "var(--popover-foreground)",
    shadow: "md",
  },
] as const;

const SEMANTIC_FILLS = [
  { name: "primary", fill: "--primary", fg: "var(--primary-foreground)" },
  { name: "secondary", fill: "--secondary", fg: "var(--secondary-foreground)" },
  { name: "muted", fill: "--muted", fg: "var(--muted-foreground)" },
  { name: "accent", fill: "--accent", fg: "var(--accent-foreground)" },
] as const;

const STATUS_SURFACES = [
  // Each status pins three opaque tokens per theme: --{name} (solid fill),
  // --{name}-surface (low-emphasis "light" background) and --{name}-text (the
  // same-hue text on that surface). They're stored, not mixed over transparent,
  // so the look is fixed regardless of what's behind the surface. The icon keeps
  // using the saturated -soft hue.
  {
    name: "destructive",
    fill: "--destructive",
    soft: "--destructive-soft",
    fg: "var(--destructive-foreground)",
    icon: CircleAlert,
    message: "This is an error message.",
  },
  {
    name: "info",
    fill: "--info",
    soft: "--info-soft",
    fg: "var(--info-foreground)",
    icon: Info,
    message: "This is an info message.",
  },
  {
    name: "warn",
    fill: "--warn",
    soft: "--warn-soft",
    fg: "var(--warn-foreground)",
    icon: TriangleAlert,
    message: "This is a warning message.",
  },
  {
    name: "success",
    fill: "--success",
    soft: "--success-soft",
    fg: "var(--success-foreground)",
    icon: CircleCheck,
    message: "This is a success message.",
  },
] as const;

/** A titled block grouping all the variants of one component. */
const GallerySection = ({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) => (
  <section
    className={cn(
      "scroll-mt-6 space-y-5 rounded-3xl border border-border/60 bg-card/40 p-6",
      className,
    )}
  >
    <div className="space-y-1">
      <h2 className="font-heading text-xl font-semibold">{title}</h2>
      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}
    </div>
    {children}
  </section>
);

/** A labelled cluster of examples within a section. */
const Group = ({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) => (
  <div className="space-y-2.5">
    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {label}
    </p>
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {children}
    </div>
  </div>
);

/**
 * Dev-only living style guide: every shadcn/ui component in the project rendered
 * across its variants, sizes, and states so the look and feel can be tuned in
 * one place. Reached from the dev toolbar's "Design" group (VITE_DEV_VIEWS).
 */
export const ComponentGallery = () => {
  const { resolvedThemeMode, toggleTheme } = useTheme();

  const [sliderValue, setSliderValue] = useState<number[]>([40]);
  const [switchOn, setSwitchOn] = useState(true);
  const [selectValue, setSelectValue] = useState("");
  const [checkboxItemChecked, setCheckboxItemChecked] = useState(true);
  const [radioValue, setRadioValue] = useState("comfortable");
  const [richColors, setRichColors] = useState(true);

  return (
    <ScrollArea className="h-full" viewportClassName="px-8 py-20" fade>
      <div className="mx-auto max-w-5xl space-y-8 pb-24">
        <header className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="font-heading text-3xl font-semibold">
              Component gallery
            </h1>
            <p className="text-sm text-muted-foreground">
              Every UI component with its variants, sizes, and states. Toggle
              the theme to check both color schemes.
            </p>
          </div>
          <Button variant="outline" size="lg" onClick={toggleTheme}>
            {resolvedThemeMode === "dark" ? (
              <Sun className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
            {resolvedThemeMode === "dark" ? "Light" : "Dark"} mode
          </Button>
        </header>

        <GallerySection
          title="Automations"
          description="Multiple lights, scenes, wheels, and preview with an example bridge."
        >
          <AutomationsDemo />
        </GallerySection>
        <GallerySection
          title="Focus"
          description="A routine in the editor, a running session, the pause between phases, and the end."
        >
          <FocusDemo />
        </GallerySection>
        <GallerySection
          title="Presence"
          description="Phones on the home Wi-Fi, what leaving does, and what coming back does."
        >
          <PresenceDemo />
        </GallerySection>
        <GallerySection
          title="Calendar"
          description="Calendars Mote reads and the rules that change lights around their events."
        >
          <CalendarDemo />
        </GallerySection>
        <GallerySection
          title="Example"
          description="A realistic slice of the app — components composed together so the tokens can be judged in context, not just in isolation."
          className="bg-background"
        >
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Room control: header toggle, brightness, scenes. */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="size-4 text-warn" />
                  Living room
                </CardTitle>
                <CardDescription>4 lights · 3 on</CardDescription>
                <CardAction>
                  <Switch defaultChecked aria-label="Toggle living room" />
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Sun className="size-4" />
                      Brightness
                    </span>
                    <span className="font-medium tabular-nums">72%</span>
                  </div>
                  <Slider defaultValue={[72]} />
                </div>

                <div className="space-y-2.5">
                  <p className="text-sm text-muted-foreground">Scenes</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm">Relax</Button>
                    <Button variant="secondary" size="sm">
                      Concentrate
                    </Button>
                    <Button variant="secondary" size="sm">
                      Energize
                    </Button>
                    <Button variant="outline" size="sm">
                      <Plus />
                      New
                    </Button>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="justify-between border-t">
                <span className="text-xs text-muted-foreground">
                  Sunset · active
                </span>
                <Button variant="ghost" size="sm">
                  <Settings />
                  Settings
                </Button>
              </CardFooter>
            </Card>

            {/* Per-light list with a light-variant status surface in context. */}
            <Card>
              <CardHeader>
                <CardTitle>Lights</CardTitle>
                <CardDescription>Toggle individual bulbs</CardDescription>
                <CardAction>
                  <Badge variant="secondary">3 on</Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-0.5">
                {[
                  { name: "Ceiling", on: true },
                  { name: "Floor lamp", on: true },
                  { name: "Reading nook", on: true },
                  { name: "Shelf strip", on: false },
                ].map((light) => (
                  <div
                    key={light.name}
                    className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-muted"
                  >
                    <span className="flex items-center gap-2.5 text-sm">
                      <span
                        className="size-2 rounded-full"
                        style={{
                          background: light.on
                            ? "var(--warn)"
                            : "var(--muted-foreground)",
                        }}
                      />
                      {light.name}
                    </span>
                    <Switch
                      defaultChecked={light.on}
                      aria-label={`Toggle ${light.name}`}
                    />
                  </div>
                ))}
              </CardContent>
              <CardFooter className="border-t">
                {/* Reuses the real "status surface · light" treatment (see the
                    Surfaces section) instead of hand-rolling warn color-mixes. */}
                {(() => {
                  const warn = STATUS_SURFACES.find((s) => s.name === "warn")!;
                  const Icon = warn.icon;
                  return (
                    <div
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs"
                      style={{
                        background: `var(--${warn.name}-surface)`,
                        color: `var(--${warn.name}-text)`,
                      }}
                    >
                      <Icon
                        className="size-3.5 shrink-0"
                        style={{ color: `var(${warn.soft})` }}
                      />
                      Shelf strip is unreachable
                    </div>
                  );
                })()}
              </CardFooter>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Battery levels</CardTitle>
                <CardDescription>
                  Critical, warning, and healthy fills at their boundaries
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4">
                {BATTERY_LEVELS.map((level) => (
                  <div
                    key={level}
                    className="flex min-w-12 flex-col items-center gap-1.5"
                  >
                    <SensorReadingPill
                      service={{
                        id: `battery-${level}`,
                        resourceType: "device_power",
                        controlId: null,
                        deviceId: null,
                        deviceName: "Battery preview",
                        productName: null,
                        reachable: true,
                        enabled: true,
                        value: `${level}%`,
                        updated: null,
                        raw: null,
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      {level}%
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </GallerySection>

        <GallerySection
          title="Surfaces"
          description="Every surface token: the neutral elevation ladder, the shared semantic fills, and the status feedback family. Toggle the theme to check both schemes."
          className="bg-background"
        >
          <Group
            label="Neutral surfaces · elevation ladder"
            className="items-stretch"
          >
            {NEUTRAL_SURFACES.map((s) => (
              <div
                key={s.name}
                className={cn(
                  // Light mode lifts via shadow (white-on-white); dark mode
                  // leans on the lightness ladder and only needs a soft halo —
                  // a heavy shadow reads as harsh against a dark surface.
                  "flex w-40 flex-col gap-1.5 rounded-2xl p-4 ring-1 ring-border/50",
                  s.shadow === "sm" &&
                    "shadow-sm dark:shadow-sm dark:shadow-black/25",
                  s.shadow === "md" &&
                    "shadow-md dark:shadow-md dark:shadow-black/30",
                )}
                style={{ background: `var(${s.fill})`, color: s.fg }}
              >
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-[10px] tracking-wide uppercase opacity-50">
                  {s.role}
                </span>
                <span className="font-mono text-[10px] opacity-60">
                  {s.fill}
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  Secondary text
                </span>
              </div>
            ))}
          </Group>

          <Group
            label="Semantic fills · shared by design"
            className="items-stretch"
          >
            {SEMANTIC_FILLS.map((s) => (
              <div
                key={s.name}
                className="flex w-40 flex-col gap-1.5 rounded-2xl p-4 shadow-sm ring-1 ring-border/50"
                style={{ background: `var(${s.fill})`, color: s.fg }}
              >
                <span className="text-sm font-medium">{s.name}</span>
                <span className="font-mono text-[10px] opacity-70">
                  {s.fill}
                </span>
                <span className="text-xs opacity-80">Aa — paired fg</span>
              </div>
            ))}
          </Group>
          <p className="max-w-2xl text-xs text-muted-foreground">
            secondary · muted · accent intentionally share one fill — the
            distinction is the foreground token (muted uses the dimmer{" "}
            <span className="font-mono">--muted-foreground</span>, visible in
            its sample line above).
          </p>

          <Group label="Status surfaces · fill" className="items-stretch">
            {STATUS_SURFACES.map((s) => (
              <div
                key={s.name}
                className="flex w-40 flex-col gap-1.5 rounded-2xl p-4 text-[16px] shadow-sm ring-1 ring-border/50"
                style={{ background: `var(${s.fill})`, color: s.fg }}
              >
                <span className="font-medium text-[14px]">{s.name}</span>
                <span className="font-mono text-[14px] opacity-70">
                  {s.fill}
                </span>
                <span className="opacity-90">Aa — message</span>
              </div>
            ))}
          </Group>

          <Group
            label="Status surfaces · light"
            className="max-w-xl flex-col items-stretch"
          >
            {STATUS_SURFACES.map((s) => {
              const Icon = s.icon;
              return (
                // MUI's "standard" Alert, retargeted to our theme tokens: the
                // opaque --{name}-surface background with same-hue --{name}-text,
                // both swapped per theme by the cascade, plus a full-color icon.
                <div
                  key={s.name}
                  className="flex items-center gap-3 rounded-xl px-4 py-3 text-[16px]"
                  style={{
                    background: `var(--${s.name}-surface)`,
                    color: `var(--${s.name}-text)`,
                  }}
                >
                  <Icon
                    className="size-5 shrink-0"
                    style={{ color: `var(${s.soft})` }}
                  />
                  <span className="font-medium text-[14px]">{s.message}</span>
                  <span className="ml-auto font-mono text-[14px] opacity-60">
                    {s.soft}
                  </span>
                </div>
              );
            })}
          </Group>
          <p className="max-w-2xl text-xs text-muted-foreground">
            destructive · info · warn · success tuned as one family. fill is the
            solid surface (warn pairs with a dark foreground, the rest
            near-white); light — a pale wash of the token with deep same-hue
            text and a full-color icon — for low-emphasis inline feedback.
          </p>
        </GallerySection>

        <GallerySection
          title="Button"
          description="6 variants × 4 sizes, plus icon sizes and states."
          className="bg-background"
        >
          {BUTTON_VARIANTS.map((variant) => (
            <Group key={variant} label={variant}>
              {BUTTON_TEXT_SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  Button
                </Button>
              ))}
            </Group>
          ))}

          <Group label="Icon sizes">
            {BUTTON_ICON_SIZES.map((size) => (
              <Button key={size} size={size} aria-label="Settings">
                <Settings />
              </Button>
            ))}
          </Group>

          <Group label="Icon + text sizes">
            {BUTTON_TEXT_SIZES.map((size) => (
              <Button key={size} variant="outline" size={size}>
                <Plus /> Button
              </Button>
            ))}
          </Group>

          <Group label="With icons">
            <Button>
              <Plus /> Leading
            </Button>
            <Button variant="outline">
              Trailing <Mail />
            </Button>
            <Button variant="secondary">
              <Copy /> Copy <Check />
            </Button>
          </Group>

          <Group label="States">
            <Button disabled>Disabled</Button>
            <Button variant="outline" disabled>
              Disabled
            </Button>
            <Button variant="destructive">
              <Trash2 /> Delete
            </Button>
            <Button aria-invalid>Invalid</Button>
          </Group>
        </GallerySection>

        <GallerySection
          title="Badge"
          description="6 variants × 3 sizes, plus status colors."
        >
          {(["default", "lg", "xl"] as const).map((size) => (
            <Group key={size} label={`Size: ${size}`}>
              {BADGE_VARIANTS.map((variant) => (
                <Badge key={variant} variant={variant} size={size}>
                  {variant}
                </Badge>
              ))}
            </Group>
          ))}
          {/* Colored badges reuse the exact "Status surfaces · light" treatment
              (see Surfaces): the opaque --{name}-surface bg with same-hue
              --{name}-text — not the badge's solid color variants. */}
          <Group label="Colors: lg">
            {STATUS_SURFACES.map((s) => (
              <Badge
                key={s.name}
                size="lg"
                style={{
                  background: `var(--${s.name}-surface)`,
                  color: `var(--${s.name}-text)`,
                }}
              >
                {s.name}
              </Badge>
            ))}
          </Group>
        </GallerySection>

        <GallerySection
          title="Button group"
          description="Adjoined buttons, text labels, and separators."
        >
          <Group label="Horizontal">
            <ButtonGroup>
              <Button variant="outline">Day</Button>
              <Button variant="outline">Week</Button>
              <Button variant="outline">Month</Button>
            </ButtonGroup>
          </Group>
          <Group label="With text & separator">
            <ButtonGroup>
              <ButtonGroupText>https://</ButtonGroupText>
              <Button variant="outline">
                <Copy />
              </Button>
              <ButtonGroupSeparator />
              <Button variant="outline">Go</Button>
            </ButtonGroup>
          </Group>
          <Group label="Vertical">
            <ButtonGroup orientation="vertical">
              <Button variant="outline">
                <Plus /> Add
              </Button>
              <Button variant="outline">
                <Settings /> Configure
              </Button>
              <Button variant="outline">
                <Trash2 /> Remove
              </Button>
            </ButtonGroup>
            <ButtonGroup orientation="vertical">
              <Button variant="outline" className="justify-start">
                <Plus /> Add
              </Button>
              <Button variant="outline" className="justify-start">
                <Settings /> Configure
              </Button>
              <Button variant="outline" className="justify-start">
                <Trash2 /> Remove
              </Button>
            </ButtonGroup>
          </Group>
        </GallerySection>

        <GallerySection title="Input" description="3 sizes and states.">
          <Group label="Sizes" className="max-w-md flex-col items-stretch">
            <Input placeholder="Default size" />
            <Input size="lg" placeholder="Large size" />
            <Input size="xl" placeholder="Extra large size" />
          </Group>
          <Group label="States" className="max-w-md flex-col items-stretch">
            <Input defaultValue="With a value" />
            <Input placeholder="Disabled" disabled />
            <Input placeholder="Invalid" aria-invalid />
            <Input placeholder="Success" data-success />
            <Input type="password" defaultValue="password" />
          </Group>
        </GallerySection>

        <GallerySection
          title="Label"
          description="3 sizes; pairs with controls."
        >
          <Group label="Sizes" className="flex-col items-start gap-3">
            <Label>Default label</Label>
            <Label size="lg">Large label</Label>
            <Label size="xl">Extra large label</Label>
          </Group>
          <Group label="With control">
            <Label className="gap-3">
              <Switch defaultChecked /> Enable notifications
            </Label>
          </Group>
        </GallerySection>

        <GallerySection title="Switch" description="4 sizes and states.">
          <Group label="Sizes">
            <Switch size="sm" defaultChecked />
            <Switch size="default" defaultChecked />
            <Switch size="lg" defaultChecked />
            <Switch size="xl" defaultChecked />
          </Group>
          <Group label="States">
            <Switch
              checked={switchOn}
              onCheckedChange={setSwitchOn}
              aria-label="Controlled"
            />
            <Switch defaultChecked={false} />
            <Switch defaultChecked disabled />
            <Switch defaultChecked={false} disabled />
          </Group>
        </GallerySection>

        <GallerySection
          title="Checkbox"
          description="Checked, unchecked, indeterminate, and disabled states."
        >
          <Group label="States">
            <Checkbox aria-label="Unchecked" />
            <Checkbox defaultChecked aria-label="Checked" />
            <Checkbox indeterminate aria-label="Indeterminate" />
            <Checkbox defaultChecked disabled aria-label="Disabled checked" />
          </Group>
        </GallerySection>

        <GallerySection
          title="Slider"
          description="3 sizes, single & range thumbs, vertical."
        >
          <Group
            label="Sizes"
            className="max-w-md flex-col items-stretch gap-6"
          >
            <Slider
              value={sliderValue}
              onValueChange={(value) =>
                setSliderValue(Array.isArray(value) ? value : [value])
              }
            />
            <Slider size="lg" defaultValue={[60]} />
            <Slider size="xl" defaultValue={[30]} />
          </Group>
          <Group label="Range">
            <div className="w-md">
              <Slider defaultValue={[25, 75]} />
            </div>
          </Group>
          <Group label="Vertical" className="h-40">
            <Slider orientation="vertical" defaultValue={[50]} />
            <Slider orientation="vertical" size="lg" defaultValue={[20, 80]} />
          </Group>
        </GallerySection>

        <GallerySection
          title="Tabs"
          description="2 variants × 3 sizes, plus vertical orientation."
        >
          <Group label="Default variant" className="flex-col items-start gap-4">
            {(["default", "lg", "xl"] as const).map((size) => (
              <Tabs key={size} defaultValue="one">
                <TabsList size={size}>
                  <TabsTrigger value="one">Overview</TabsTrigger>
                  <TabsTrigger value="two">Activity</TabsTrigger>
                  <TabsTrigger value="three">Settings</TabsTrigger>
                </TabsList>
              </Tabs>
            ))}
          </Group>
          <Group label="Line variant">
            <Tabs defaultValue="one">
              <TabsList variant="line">
                <TabsTrigger value="one">Overview</TabsTrigger>
                <TabsTrigger value="two">Activity</TabsTrigger>
                <TabsTrigger value="three">Settings</TabsTrigger>
              </TabsList>
            </Tabs>
          </Group>
          <Group label="With content">
            <Tabs defaultValue="account" className="w-80">
              <TabsList>
                <TabsTrigger value="account">Account</TabsTrigger>
                <TabsTrigger value="password">Password</TabsTrigger>
              </TabsList>
              <TabsContent
                value="account"
                className="pt-3 text-muted-foreground"
              >
                Make changes to your account here.
              </TabsContent>
              <TabsContent
                value="password"
                className="pt-3 text-muted-foreground"
              >
                Change your password here.
              </TabsContent>
            </Tabs>
          </Group>
          <Group label="Vertical">
            <Tabs orientation="vertical" defaultValue="one">
              <TabsList>
                <TabsTrigger value="one">General</TabsTrigger>
                <TabsTrigger value="two">Display</TabsTrigger>
                <TabsTrigger value="three">Advanced</TabsTrigger>
              </TabsList>
            </Tabs>
          </Group>
        </GallerySection>

        <GallerySection
          title="Select"
          description="3 trigger sizes, grouped items with a separator."
        >
          <Group label="Sizes">
            {(["sm", "default", "xl"] as const).map((size) => (
              <Select
                key={size}
                value={selectValue}
                onValueChange={(value) => setSelectValue(value ?? "")}
              >
                <SelectTrigger size={size} className="w-44">
                  <SelectValue placeholder={`Size: ${size}`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Fruits</SelectLabel>
                    <SelectItem value="apple">Apple</SelectItem>
                    <SelectItem value="banana">Banana</SelectItem>
                    <SelectItem value="orange">Orange</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Vegetables</SelectLabel>
                    <SelectItem value="carrot">Carrot</SelectItem>
                    <SelectItem value="potato" disabled>
                      Potato (disabled)
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            ))}
          </Group>
        </GallerySection>

        <GallerySection title="Card" description="Default & small spacing.">
          <Group label="Variants" className="items-stretch">
            <Card className="w-72">
              <CardHeader>
                <CardTitle>Living room</CardTitle>
                <CardDescription>4 lights · 2 on</CardDescription>
                <CardAction>
                  <Button variant="ghost" size="icon-sm" aria-label="Settings">
                    <Settings />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Card body content lives here with the default spacing.
              </CardContent>
              <CardFooter className="justify-end gap-2 border-t">
                <Button variant="ghost">Cancel</Button>
                <Button>Save</Button>
              </CardFooter>
            </Card>
            <Card size="sm" className="w-60">
              <CardHeader>
                <CardTitle>Small card</CardTitle>
                <CardDescription>Tighter spacing.</CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground">
                Compact content area.
              </CardContent>
            </Card>
          </Group>
        </GallerySection>

        <GallerySection title="Accordion" description="Collapsible sections.">
          <Accordion className="w-full max-w-lg">
            <AccordionItem value="a">
              <AccordionTrigger>Is it accessible?</AccordionTrigger>
              <AccordionContent>
                Yes. It adheres to the WAI-ARIA design pattern.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="b">
              <AccordionTrigger>Is it styled?</AccordionTrigger>
              <AccordionContent>
                Yes, it ships with default styles matching the rest of the UI.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="c">
              <AccordionTrigger>Is it animated?</AccordionTrigger>
              <AccordionContent>
                Yes, the panel expands and collapses with a height transition.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </GallerySection>

        <GallerySection title="Collapsible" description="Show/hide a region.">
          <Collapsible className="w-full max-w-lg space-y-2">
            <CollapsibleTrigger
              render={
                <Button variant="outline" className="w-full justify-between">
                  Toggle details
                  <Plus />
                </Button>
              }
            />
            <CollapsibleContent>
              <div className="space-y-2 rounded-2xl border p-4 text-muted-foreground">
                <p>Hidden content row one.</p>
                <p>Hidden content row two.</p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </GallerySection>

        <GallerySection title="Separator" description="Horizontal & vertical.">
          <Group label="Horizontal" className="max-w-md flex-col items-stretch">
            <span className="text-muted-foreground">Above</span>
            <Separator />
            <span className="text-muted-foreground">Below</span>
          </Group>
          <Group label="Vertical" className="h-8">
            <span className="text-muted-foreground">Left</span>
            <Separator orientation="vertical" />
            <span className="text-muted-foreground">Middle</span>
            <Separator orientation="vertical" />
            <span className="text-muted-foreground">Right</span>
          </Group>
        </GallerySection>

        <GallerySection title="Skeleton" description="Loading placeholders.">
          <div className="flex w-full max-w-sm items-center gap-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        </GallerySection>

        <GallerySection
          title="Dialog"
          description="Modal with header, body, and footer."
        >
          <Dialog>
            <DialogTrigger
              render={<Button variant="outline">Open dialog</Button>}
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Rename scene</DialogTitle>
                <DialogDescription>
                  Give this scene a new name. This won't affect the lights.
                </DialogDescription>
              </DialogHeader>
              <Input defaultValue="Sunset" />
              <DialogFooter>
                <DialogClose render={<Button variant="ghost">Cancel</Button>} />
                <DialogClose render={<Button>Save</Button>} />
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </GallerySection>

        <GallerySection
          title="Alert dialog"
          description="Confirmation dialogs; default & small with optional media."
        >
          <Group label="Variants">
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button variant="outline">Default</Button>}
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this room?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. The room and its layout will
                    be removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger
                render={<Button variant="outline">Small + media</Button>}
              />
              <AlertDialogContent size="sm">
                <AlertDialogHeader>
                  <AlertDialogMedia>
                    <Trash2 />
                  </AlertDialogMedia>
                  <AlertDialogTitle>Remove light?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will unpair the light from your bridge.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction variant="destructive">
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Group>
        </GallerySection>

        <GallerySection
          title="Sheet"
          description="Slide-out panels from each edge."
        >
          <Group label="Sides">
            {(["left", "right", "top", "bottom"] as const).map((side) => (
              <Sheet key={side}>
                <SheetTrigger
                  render={<Button variant="outline">{side}</Button>}
                />
                <SheetContent side={side}>
                  <SheetHeader>
                    <SheetTitle>Sheet from {side}</SheetTitle>
                    <SheetDescription>
                      A slide-out panel anchored to the {side} edge.
                    </SheetDescription>
                  </SheetHeader>
                  <SheetFooter>
                    <SheetClose render={<Button>Done</Button>} />
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            ))}
          </Group>
        </GallerySection>

        <GallerySection
          title="Dropdown menu"
          description="Items, checkbox, radio group, submenu, destructive."
        >
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline">Open menu</Button>}
            />
            <DropdownMenuContent className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>My account</DropdownMenuLabel>
                <DropdownMenuItem>
                  <Settings /> Settings
                  <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Heart /> Favorites
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={checkboxItemChecked}
                onCheckedChange={setCheckboxItemChecked}
              >
                Show notifications
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={radioValue}
                onValueChange={setRadioValue}
              >
                <DropdownMenuRadioItem value="comfortable">
                  Comfortable
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="compact">
                  Compact
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>More options</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem>
                    <Copy /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Mail /> Email
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </GallerySection>

        <GallerySection
          title="Toast (Sonner)"
          description="Every toast type, content option, async pattern, and behavior. The app's global Toaster (sonner.tsx) is plain & bottom-right; the rich-colors group below mounts its own top-center Toaster, so those toasts appear in both."
        >
          <Group label="Types">
            <Button variant="outline" onClick={() => toast("Event created")}>
              Default
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.success("Saved successfully")}
            >
              Success
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.error("Something went wrong")}
            >
              Error
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.warning("Low battery")}
            >
              Warning
            </Button>
            <Button variant="outline" onClick={() => toast.info("Heads up")}>
              Info
            </Button>
            <Button
              variant="outline"
              onClick={() => toast.loading("Connecting to bridge…")}
            >
              Loading
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast.message("Scene updated", {
                  description: "Sunset applied to Living room.",
                })
              }
            >
              Message
            </Button>
          </Group>

          <Group label="Content">
            <Button
              variant="outline"
              onClick={() =>
                toast("Scene updated", {
                  description: "Sunset applied to Living room.",
                })
              }
            >
              With description
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast("Motion detected", {
                  description: "Front door · just now",
                  icon: <Bell />,
                })
              }
            >
              Custom icon
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast("Scene updated", {
                  description: "Sunset applied to Living room.",
                  action: {
                    label: "Undo",
                    onClick: () => toast("Reverted"),
                  },
                })
              }
            >
              With action
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast("Delete this room?", {
                  description: "This can't be undone.",
                  action: {
                    label: "Delete",
                    onClick: () => toast.success("Deleted"),
                  },
                  cancel: { label: "Cancel", onClick: () => {} },
                })
              }
            >
              Action + cancel
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast.custom((id) => (
                  <div className="flex w-72 items-center gap-3 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg">
                    <Heart className="size-5 text-rose-500" />
                    <div className="flex-1 text-sm">
                      <p className="font-medium">Fully custom JSX</p>
                      <p className="text-muted-foreground">
                        Render anything you like.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toast.dismiss(id)}
                    >
                      Close
                    </Button>
                  </div>
                ))
              }
            >
              Custom JSX
            </Button>
          </Group>

          <Group label="Async">
            <Button
              variant="outline"
              onClick={() =>
                toast.promise(
                  new Promise((resolve) => setTimeout(resolve, 2000)),
                  {
                    loading: "Saving scene…",
                    success: "Scene saved",
                    error: "Couldn't save scene",
                  },
                )
              }
            >
              Promise
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const id = toast.loading("Connecting…");
                setTimeout(() => toast.success("Connected", { id }), 1500);
              }}
            >
              Update by id
            </Button>
          </Group>

          <Group label="Behavior">
            <Button
              variant="outline"
              onClick={() => toast("Stays for 10s", { duration: 10000 })}
            >
              Long duration
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast("Won't auto-dismiss", { duration: Infinity })
              }
            >
              Persistent
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast("With a close button", { closeButton: true })
              }
            >
              Close button
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast("Can't be swiped away", { dismissible: false })
              }
            >
              Not dismissible
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast("Top of the screen", { position: "top-center" })
              }
            >
              Custom position
            </Button>
            <Button variant="outline" onClick={() => toast.dismiss()}>
              Dismiss all
            </Button>
          </Group>

          <Group label="Rich colors" className="flex-col items-start gap-3">
            <Label className="gap-3">
              <Switch checked={richColors} onCheckedChange={setRichColors} />
              Mount a richColors Toaster (top-center)
            </Label>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => toast.success("Saved successfully")}
              >
                Success
              </Button>
              <Button
                variant="outline"
                onClick={() => toast.error("Something went wrong")}
              >
                Error
              </Button>
              <Button
                variant="outline"
                onClick={() => toast.warning("Low battery")}
              >
                Warning
              </Button>
              <Button variant="outline" onClick={() => toast.info("Heads up")}>
                Info
              </Button>
            </div>
            {richColors && (
              <Toaster richColors closeButton position="top-center" />
            )}
          </Group>
        </GallerySection>

        <GallerySection
          title="Scroll area"
          description="Custom scrollbar over overflowing content."
        >
          <ScrollArea className="h-40 w-72 rounded-2xl border">
            <div className="space-y-2 p-4">
              {Array.from({ length: 20 }, (_, i) => (
                <p key={i} className="text-sm text-muted-foreground">
                  Scrollable row {i + 1}
                </p>
              ))}
            </div>
          </ScrollArea>
        </GallerySection>

        <GallerySection title="Carousel" description="Embla-backed slides.">
          <div className="px-12">
            <Carousel className="w-72">
              <CarouselContent>
                {Array.from({ length: 5 }, (_, i) => (
                  <CarouselItem key={i}>
                    <Card className="items-center justify-center">
                      <CardContent className="flex h-32 items-center justify-center">
                        <span className="font-heading text-3xl font-semibold">
                          {i + 1}
                        </span>
                      </CardContent>
                    </Card>
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious />
              <CarouselNext />
            </Carousel>
          </div>
        </GallerySection>

        <GallerySection
          title="Resizable"
          description="Draggable panel group with a handle."
        >
          <ResizablePanelGroup
            orientation="horizontal"
            className="h-40 max-w-lg rounded-2xl border"
          >
            <ResizablePanel defaultSize={50}>
              <div className="flex h-full items-center justify-center p-6 text-muted-foreground">
                One
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50}>
              <div className="flex h-full items-center justify-center p-6 text-muted-foreground">
                Two
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </GallerySection>
      </div>
    </ScrollArea>
  );
};
