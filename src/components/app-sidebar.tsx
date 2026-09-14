"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  Users,
  UserPlus,
  ArrowRightLeft,
  ClipboardList,
  Gauge,
  ShieldAlert,
  History,
  BarChart3,
  MapPin,
  FileSignature,
  Fuel,
  Banknote,
  CreditCard,
  UserCog,
  ScrollText,
  Settings,
  Menu,
  ChevronLeft,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/* ═══════════════════════════════════════════════════════════════════════
 * DEFINICIÓN DE NAVEGACIÓN
 *
 * Las secciones están agrupadas exactamente como define permissions.md §7.
 * Cada item tiene un permiso requerido; si el usuario no lo tiene,
 * el item no se renderiza. La seguridad real vive en RLS; esto es UX.
 * ═══════════════════════════════════════════════════════════════════════ */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permiso: string | null;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Operación",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, permiso: null },
      { href: "/consulta", label: "Consulta", icon: Search, permiso: null },
      { href: "/choferes", label: "Choferes", icon: Users, permiso: "choferes.ver" },
      { href: "/alta", label: "Alta de chofer", icon: UserPlus, permiso: "choferes.crear" },
      { href: "/asignaciones", label: "Asignaciones", icon: ArrowRightLeft, permiso: "asignaciones.ver" },
      { href: "/ordenes", label: "Órdenes", icon: ClipboardList, permiso: "folios.ver" },
    ],
  },
  {
    title: "Control",
    items: [
      { href: "/cupos", label: "Cupos", icon: Gauge, permiso: "cupos.ver" },
      { href: "/lista-negra", label: "Lista negra", icon: ShieldAlert, permiso: "lista_negra.ver" },
      { href: "/antecedentes", label: "Antecedentes", icon: History, permiso: null },
      { href: "/reportes", label: "Reportes", icon: BarChart3, permiso: "reportes.ver" },
      { href: "/gps", label: "GPS", icon: MapPin, permiso: "gps.ver" },
    ],
  },
  {
    title: "Caja",
    items: [
      { href: "/contratos", label: "Contratos", icon: FileSignature, permiso: "contratos.ver" },
      { href: "/combustible", label: "Combustible", icon: Fuel, permiso: "caja.ver" },
      { href: "/anticipos", label: "Anticipos", icon: Banknote, permiso: "caja.ver" },
      { href: "/pagos", label: "Pagos", icon: CreditCard, permiso: "caja.ver" },
    ],
  },
  {
    title: "Administración",
    items: [
      { href: "/usuarios", label: "Usuarios", icon: UserCog, permiso: "admin.usuarios" },
      { href: "/auditoria", label: "Auditoría", icon: ScrollText, permiso: "auditoria.ver" },
      { href: "/configuracion", label: "Configuración", icon: Settings, permiso: "admin.catalogos" },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════════════
 * COMPONENTE SIDEBAR
 * ═══════════════════════════════════════════════════════════════════════ */

interface SidebarProps {
  permisos: Set<string>;
  usuario: { nombre: string; email: string; soloLectura: boolean };
  onSignOut: () => void;
}

function SidebarNavItem({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  const content = (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        collapsed && "justify-center px-2",
      )}
      aria-current={isActive ? "page" : undefined}
    >
      <item.icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

function SidebarContent({
  permisos,
  usuario,
  collapsed,
  onSignOut,
  onToggle,
}: SidebarProps & { collapsed: boolean; onToggle?: () => void }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.permiso || permisos.has(item.permiso),
    ),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className={cn("flex items-center border-b px-4 py-4", collapsed && "justify-center px-2")}>
        {!collapsed ? (
          <div className="flex flex-1 items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-sm font-bold">D</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">Día D</p>
              <p className="truncate text-[11px] text-muted-foreground">Villa Hayes</p>
            </div>
            {onToggle && (
              <Button variant="ghost" size="icon" onClick={onToggle} className="h-7 w-7 shrink-0">
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Colapsar sidebar</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-sm font-bold">D</span>
            </div>
            {onToggle && (
              <Button variant="ghost" size="icon" onClick={onToggle} className="h-7 w-7">
                <Menu className="h-4 w-4" />
                <span className="sr-only">Expandir sidebar</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-3">
        <nav aria-label="Navegación principal" className="space-y-4">
          {visibleGroups.map((group, i) => (
            <div key={group.title}>
              {i > 0 && <Separator className="mb-3" />}
              {!collapsed && (
                <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarNavItem
                    key={item.href}
                    item={item}
                    isActive={isActive(item.href)}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Footer — usuario */}
      <div className={cn("border-t p-3", collapsed && "flex flex-col items-center")}>
        {!collapsed && (
          <div className="mb-2 px-3">
            <p className="truncate text-sm font-medium">{usuario.nombre}</p>
            <p className="truncate text-xs text-muted-foreground">{usuario.email}</p>
            {usuario.soloLectura && (
              <p className="mt-0.5 text-[11px] font-medium text-warning">Solo lectura</p>
            )}
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "sm"}
          onClick={onSignOut}
          className={cn("w-full text-muted-foreground hover:text-destructive", collapsed && "w-auto")}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Cerrar sesión</span>}
        </Button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * EXPORTS
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * Sidebar para desktop — colapsable.
 */
export function AppSidebar(props: SidebarProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <TooltipProvider>
      <aside
        data-sidebar
        className={cn(
          "hidden h-screen flex-col border-r bg-sidebar transition-all duration-200 lg:flex",
          collapsed ? "w-[60px]" : "w-[240px]",
        )}
      >
        <SidebarContent
          {...props}
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
        />
      </aside>
    </TooltipProvider>
  );
}

/**
 * Sidebar para mobile — sheet desde la izquierda.
 */
export function MobileSidebar(props: SidebarProps) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Cerrar al navegar
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetTitle className="sr-only">Navegación</SheetTitle>
        <TooltipProvider>
          <SidebarContent {...props} collapsed={false} />
        </TooltipProvider>
      </SheetContent>
    </Sheet>
  );
}
