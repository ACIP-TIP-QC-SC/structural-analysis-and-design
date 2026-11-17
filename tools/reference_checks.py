#!/usr/bin/env python3
"""Independent hand-check calculations for the Phase 1 test cases in HANDOFF.md.
Plain Python, no libraries. Units: N, mm, MPa unless a label says otherwise.
Run: python3 reference_checks.py"""
from math import pi, sqrt, sin, cos, tan, radians, exp, atan, floor
Es = 200000.0
def beta1(fc): return 0.85 if fc <= 28 else max(0.65, 0.85 - 0.05*(fc-28)/7)
def phi_flex(et, fy):
    ety = fy/Es
    return 0.90 if et >= 0.005 else 0.65 if et <= ety else 0.65 + 0.25*(et-ety)/(0.005-ety)
def P(tag, **kw):
    print(tag + ': ' + ', '.join(f"{k}={v:.5g}" if isinstance(v, float) else f"{k}={v}" for k, v in kw.items()))
def bar(n, db): return n*pi*db*db/4

# ---------- RC-F1..F3 singly reinforced, analysis (USD)
def singly(tag, b, d, fc, fy, n, db, Mu):
    As = bar(n, db); b1 = beta1(fc)
    a = As*fy/(0.85*fc*b); c = a/b1; et = 0.003*(d-c)/c; fs = fy
    if et < fy/Es:
        A = 0.85*fc*b*b1; B = As*Es*0.003
        c = (-B + sqrt(B*B + 4*A*B*d))/(2*A); a = b1*c; et = 0.003*(d-c)/c; fs = Es*et
    ph = phi_flex(et, fy); Mn = As*fs*(d-a/2)/1e6
    Asmin = max(0.25*sqrt(fc)/fy, 1.4/fy)*b*d
    P(tag, As=As, a=a, c=c, et=et, fs=fs, phi=ph, Mn=Mn, phiMn=ph*Mn, DC_flex=Mu/(ph*Mn), Asmin=Asmin, DC_min=Asmin/As, DC_duct=0.004/et)
singly('RC-F1', 300, 440, 28, 420, 3, 25, 180)
singly('RC-F2', 250, 390, 21, 420, 5, 28, 200)
singly('RC-F3', 300, 540, 28, 420, 2, 12, 40)

# ---------- RC-F4 singly, design: required As for Mu
def design(tag, b, d, fc, fy, Mu):
    Rn = Mu*1e6/(0.9*b*d*d); m = fy/(0.85*fc)
    rho = (1/m)*(1 - sqrt(1 - 2*m*Rn/fy)); As = rho*b*d
    b1 = beta1(fc); a = As*fy/(0.85*fc*b); c = a/b1; et = 0.003*(d-c)/c
    Asmin = max(0.25*sqrt(fc)/fy, 1.4/fy)*b*d
    rho_max004 = 0.85*b1*fc/fy*(0.003/(0.003+0.004)); rho_tc = 0.85*b1*fc/fy*(0.003/0.008)
    P(tag, Rn=Rn, rho=rho, As_req=As, a=a, c=c, et=et, Asmin=Asmin, rho_at_et004=rho_max004, rho_at_et005=rho_tc)
design('RC-F4', 300, 440, 28, 420, 250)

# ---------- RC-F5 doubly reinforced, analysis
def doubly(tag, b, d, dp, fc, fy, As, Asp, Mu):
    b1 = beta1(fc)
    # assume both yield
    a = (As-Asp)*fy/(0.85*fc*b); c = a/b1
    esp = 0.003*(c-dp)/c
    if esp >= fy/Es: fsp = fy
    else:
        # 0.85 fc b b1 c + Asp (Es*0.003*(c-dp)/c - 0.85fc) = As fy  (concrete displaced by A's deducted)
        A = 0.85*fc*b*b1; B = Asp*(Es*0.003 - 0.85*fc) - As*fy; C = -Asp*Es*0.003*dp
        c = (-B + sqrt(B*B - 4*A*C))/(2*A); a = b1*c; esp = 0.003*(c-dp)/c; fsp = Es*esp
    et = 0.003*(d-c)/c; ph = phi_flex(et, fy)
    if fsp == fy:
        # recompute with displaced concrete deducted for consistency
        A = 0.85*fc*b*b1; c = (As*fy - Asp*(fy-0.85*fc))/A; a = b1*c; esp = 0.003*(c-dp)/c; et = 0.003*(d-c)/c; ph = phi_flex(et, fy)
    Cc = 0.85*fc*a*b; Cs = Asp*(fsp-0.85*fc)
    Mn = (Cc*(d-a/2) + Cs*(d-dp))/1e6
    P(tag, As=As, Asp=Asp, c=c, a=a, eps_s_prime=esp, fs_prime=fsp, et=et, phi=ph, Cc_kN=Cc/1e3, Cs_kN=Cs/1e3, Mn=Mn, phiMn=ph*Mn, DC=Mu/(ph*Mn))
doubly('RC-F5', 300, 440, 60, 28, 420, bar(6, 25), bar(2, 20), 350)
doubly('RC-F6', 300, 500, 60, 21, 420, bar(4, 28), bar(2, 25), 300)

# ---------- RC-F7/F8 T-beam analysis
def tbeam(tag, bf, hf, bw, d, fc, fy, As, Mu):
    b1 = beta1(fc); a = As*fy/(0.85*fc*bf)
    if a <= hf:
        c = a/b1; Mn = As*fy*(d-a/2)/1e6; case = 'a<=hf (rectangular, width bf)'
    else:
        Cf = 0.85*fc*(bf-bw)*hf; a = (As*fy - Cf)/(0.85*fc*bw); c = a/b1
        Mn = (Cf*(d-hf/2) + 0.85*fc*bw*a*(d-a/2))/1e6; case = 'a>hf (flange + web)'
    et = 0.003*(d-c)/c; ph = phi_flex(et, fy)
    Asmin = max(0.25*sqrt(fc)/fy, 1.4/fy)*bw*d
    P(tag, case=case, As=As, a=a, c=c, et=et, phi=ph, Mn=Mn, phiMn=ph*Mn, DC=Mu/(ph*Mn), Asmin=Asmin)
tbeam('RC-F7', 1200, 100, 300, 500, 21, 420, bar(6, 28), 600)
tbeam('RC-F8', 600, 100, 300, 500, 21, 420, bar(8, 28), 700)

# ---------- RC-W1 WSD singly (NSCP 429), n rounded to nearest whole number (>= 6)
def wsd(tag, b, d, fc, fy, As, M, round_n=True):
    Ec = 4700*sqrt(fc); n = Es/Ec
    if round_n: n = max(6, floor(n+0.5))
    k = (-n*As + sqrt((n*As)**2 + 2*b*n*As*d))/(b*d)   # from b(kd)^2/2 = nAs(d-kd)
    kd = k*d; j = 1-k/3; Icr = b*kd**3/3 + n*As*(d-kd)**2
    fcs = M*1e6*kd/Icr; fs = n*M*1e6*(d-kd)/Icr
    fca = 0.45*fc; fsa = 140 if fy < 420 else 170
    Mc = fca*Icr/kd/1e6; Ms = fsa*Icr/(n*(d-kd))/1e6
    P(tag, Ec=Ec, n=n, kd=kd, k=k, j=j, Icr=Icr, fc_actual=fcs, fc_allow=fca, fs_actual=fs, fs_allow=fsa, DC_conc=fcs/fca, DC_steel=fs/fsa, M_allow=min(Mc, Ms))
wsd('RC-W1', 300, 440, 28, 420, bar(3, 25), 90)
wsd('RC-W2', 250, 390, 21, 280, bar(4, 20), 60)

# ---------- RC-S1/S2 beam shear
def shear(tag, bw, d, fc, fyt, Vu, dbs, legs, lam=1.0):
    Vc = 0.17*lam*sqrt(fc)*bw*d/1e3; ph = 0.75; Av = legs*pi*dbs**2/4
    Vs_req = max(Vu/ph - Vc, 0); Vs_max = 0.66*sqrt(fc)*bw*d/1e3
    s_str = Av*fyt*d/(Vs_req*1e3) if Vs_req > 0 else float('inf')
    s_max = min(d/2, 600) if Vs_req <= 0.33*sqrt(fc)*bw*d/1e3 else min(d/4, 300)
    s_avmin = Av*fyt/max(0.062*sqrt(fc)*bw, 0.35*bw)
    need = 'none (Vu <= 0.5 phi Vc)' if Vu <= 0.5*ph*Vc else 'minimum' if Vu <= ph*Vc else 'designed'
    s = min(s_str, s_max, s_avmin)
    P(tag, Vc_kN=Vc, phiVc=ph*Vc, half_phiVc=0.5*ph*Vc, stirrups=need, Av=Av, Vs_req=Vs_req, Vs_limit=Vs_max, s_strength=s_str, s_max=s_max, s_Avmin=s_avmin, s_use=s)
    return s
shear('RC-S1', 300, 440, 28, 280, 180, 10, 2)
shear('RC-S2', 300, 440, 28, 280, 60, 10, 2)
shear('RC-S3', 350, 540, 21, 420, 420, 10, 2)
# analysis of given spacing
bw, d, fc, fyt, s = 300, 440, 28, 280, 150; Av = 2*pi*100/4
Vc = 0.17*sqrt(fc)*bw*d/1e3; Vs = Av*fyt*d/s/1e3
P('RC-S4', Vc=Vc, Vs=Vs, phiVn=0.75*(Vc+Vs))

# ---------- RC-T1 torsion (solid rectangular section, nonprestressed, Nu = 0)
def torsion(tag, b, h, cov_c, fc, fy, fyt, Tu, Vu, d, dbs):
    # cov_c = distance from concrete face to CENTERLINE of closed stirrup
    Acp = b*h; pcp = 2*(b+h); x1 = b-2*cov_c; y1 = h-2*cov_c
    Aoh = x1*y1; ph_ = 2*(x1+y1); Ao = 0.85*Aoh; phi = 0.75
    Tth = 0.083*sqrt(fc)*Acp**2/pcp/1e6; Tcr = 0.33*sqrt(fc)*Acp**2/pcp/1e6
    lhs = sqrt((Vu*1e3/(b*d))**2 + (Tu*1e6*ph_/(1.7*Aoh**2))**2)
    Vc = 0.17*sqrt(fc)*b*d
    rhs = phi*(Vc/(b*d) + 0.66*sqrt(fc))
    At_s = Tu*1e6/(phi*2*Ao*fyt)        # theta = 45 deg
    Av_s = max(Vu*1e3/phi - Vc, 0)/(fyt*d)
    tot = 2*At_s + Av_s                  # (Av + 2At)/s, mm2/mm
    tot_min = max(0.062*sqrt(fc)*b/fyt, 0.35*b/fyt)
    Abar = pi*dbs**2/4; s_req = 2*Abar/max(tot, tot_min); s_max = min(ph_/8, 300)
    Al = At_s*ph_*fyt/fy
    Al_min = min(0.42*sqrt(fc)*Acp/fy - At_s*ph_*fyt/fy, 0.42*sqrt(fc)*Acp/fy - (0.175*b/fyt)*ph_*fyt/fy)
    P(tag, Acp=Acp, pcp=pcp, Aoh=Aoh, ph=ph_, Ao=Ao, phiTth=phi*Tth, phiTcr=phi*Tcr, sect_lhs=lhs, sect_rhs=rhs, At_s=At_s, Av_s=Av_s, AvplusTwoAt_s=tot, min_s_ratio=tot_min, s_req=s_req, s_max=s_max, Al=Al, Al_min=Al_min)
torsion('RC-T1', 350, 600, 45, 28, 420, 420, 40, 150, 540, 10)

# ---------- RC-SL1 one-way slab, 1 m strip
def slab(tag, h, d, fc, fy, Mu, L, cond, db):
    b = 1000; div = {'simple': 20, 'one': 24, 'both': 28, 'cant': 10}[cond]
    hmin = L/div*(0.4 + fy/700)
    Rn = Mu*1e6/(0.9*b*d*d); m = fy/(0.85*fc); rho = (1/m)*(1 - sqrt(1-2*m*Rn/fy)); As = rho*b*d
    rmin = 0.0020 if fy < 420 else max(0.0018*420/fy, 0.0014); Asmin = rmin*b*h
    Asu = max(As, Asmin); Ab = pi*db*db/4; s = Ab*1000/Asu; smax = min(3*h, 450)
    Vc = 0.17*sqrt(fc)*b*d/1e3
    P(tag, hmin=hmin, Rn=Rn, rho=rho, As_req=As, As_min=Asmin, As_use=Asu, s_calc=s, s_max_main=smax, s_temp_for10mm=pi*25*1000/Asmin, s_max_temp=min(5*h, 450), phiVc_kN_per_m=0.75*Vc)
slab('RC-SL1', 150, 120, 21, 280, 18, 3600, 'one', 12)
slab('RC-SL2', 125, 100, 28, 420, 9, 3000, 'both', 10)

# ---------- ST-T1 tension member W250x67 (seed table), bolted through flanges
A, d, bf, tf = 8581, 257, 204, 15.7; Fy, Fu = 248, 400
dh = 22 + 2   # M20 std hole 22 mm, +2 mm for net area
An = A - 4*dh*tf; U = 0.90 if bf >= 2*d/3 else 0.85; Ae = U*An
P('ST-T1', An=An, U=U, Ae=Ae, Pn_yield_kN=Fy*A/1e3, Pn_rupt_kN=Fu*Ae/1e3, LRFD_yield=0.9*Fy*A/1e3, LRFD_rupt=0.75*Fu*Ae/1e3, ASD_yield=Fy*A/1.67e3, ASD_rupt=Fu*Ae/2e3)
# ---------- ST-T2 block shear, plate 12 mm, 2 rows x 3 M20 bolts, pitch 75, end 40, gauge 75, side... U shaped block
t = 12; dh = 24; Agv = 2*(40+2*75)*t; Anv = Agv - 2*2.5*dh*t; Ant = (75 - dh)*t
Rn = min(0.6*Fu*Anv + 1.0*Fu*Ant, 0.6*Fy*Agv + 1.0*Fu*Ant)/1e3
P('ST-T2', Agv=Agv, Anv=Anv, Ant=Ant, rupture_path=(0.6*Fu*Anv + Fu*Ant)/1e3, yield_path=(0.6*Fy*Agv + Fu*Ant)/1e3, Rn_kN=Rn, LRFD=0.75*Rn, ASD=Rn/2)

# ---------- ST-C1.. compression W250x73
def comp(tag, A, rx, ry, KLx, KLy, Fy, bf2tf, htw, E=200000):
    slx, sly = KLx/rx, KLy/ry; sl = max(slx, sly); Fe = pi**2*E/sl**2
    lim = 4.71*sqrt(E/Fy)
    Fcr = 0.658**(Fy/Fe)*Fy if sl <= lim else 0.877*Fe
    Pn = Fcr*A/1e3
    P(tag, KLr_x=slx, KLr_y=sly, limit=lim, Fe=Fe, Fcr=Fcr, Pn_kN=Pn, LRFD=0.9*Pn, ASD=Pn/1.67, flange_lim=0.56*sqrt(E/Fy), bf2tf=bf2tf, web_lim=1.49*sqrt(E/Fy), htw=htw)
comp('ST-C1', 9290, 110, 64.5, 4500, 4500, 345, 8.93, 23.1)
comp('ST-C2', 9290, 110, 64.5, 9000, 9000, 345, 8.93, 23.1)
comp('ST-C3', 9290, 110, 64.5, 8000, 4000, 248, 8.93, 23.1)

# ---------- ST-B beams, W250x45 (seed table)
def beam(tag, Zx, Sx, ry, J, rts, ho, Fy, Lb, Cb, d, tw, htw, bf2tf, E=200000):
    Zx *= 1e3; Sx *= 1e3; J *= 1e3
    Mp = Fy*Zx; Lp = 1.76*ry*sqrt(E/Fy); c = 1.0
    Lr = 1.95*rts*(E/(0.7*Fy))*sqrt(J*c/(Sx*ho))*sqrt(1 + sqrt(1 + 6.76*(0.7*Fy*Sx*ho/(E*J*c))**2))
    if Lb <= Lp: Mn = Mp; zone = 'yielding (Lb<=Lp)'
    elif Lb <= Lr: Mn = min(Cb*(Mp - (Mp - 0.7*Fy*Sx)*(Lb-Lp)/(Lr-Lp)), Mp); zone = 'inelastic LTB'
    else:
        Fcr = Cb*pi**2*E/(Lb/rts)**2*sqrt(1 + 0.078*J*c/(Sx*ho)*(Lb/rts)**2); Mn = min(Fcr*Sx, Mp); zone = 'elastic LTB'
    Cv = 1.0; rolled = htw <= 2.24*sqrt(E/Fy)
    Vn = 0.6*Fy*d*tw*Cv/1e3
    P(tag, Mp_kNm=Mp/1e6, Lp=Lp, Lr=Lr, zone=zone, Mn_kNm=Mn/1e6, LRFD_M=0.9*Mn/1e6, ASD_M=Mn/1.67e6, flange_lp=0.38*sqrt(E/Fy), bf2tf=bf2tf, web_lp=3.76*sqrt(E/Fy), htw=htw,
      Vn_kN=Vn, LRFD_V=(1.0 if rolled else 0.9)*Vn, ASD_V=Vn/(1.5 if rolled else 1.67))
w45 = dict(Zx=599.8, Sx=530.9, ry=34.8, J=258.9, rts=40.6, ho=253.7, d=267, tw=7.6, htw=29.5, bf2tf=5.70)
beam('ST-B1', Fy=345, Lb=1200, Cb=1.0, **w45)
beam('ST-B2', Fy=345, Lb=3000, Cb=1.0, **w45)
beam('ST-B3', Fy=345, Lb=7000, Cb=1.0, **w45)
beam('ST-B4', Fy=345, Lb=3000, Cb=1.14, **w45)
# deflection: simple span 6 m, service live 12 kN/m, Ix = 70.759e6
w, L, I = 12.0, 6000.0, 70.759e6
P('ST-B5', delta_mm=5*w*L**4/(384*200000*I), L_over_360=L/360)

# ---------- FD-B bearing capacity
TERZ = {30: (37.16, 22.46, 19.13), 25: (25.13, 12.72, 8.34), 20: (17.69, 7.44, 3.64), 0: (5.70, 1.0, 0.0)}
def terz(tag, shape, B, Df, c, ph, g, FS):
    Nc, Nq, Ng = TERZ[ph]; q = g*Df
    k = {'strip': (1.0, 0.5), 'square': (1.3, 0.4), 'circle': (1.3, 0.3)}[shape]
    qu = k[0]*c*Nc + q*Nq + k[1]*g*B*Ng
    P(tag, Nc=Nc, Nq=Nq, Ngamma=Ng, q=q, qu=qu, qall_gross=qu/FS, qall_net=(qu-q)/FS, Q_all_gross_kN=qu/FS*(B*B if shape == 'square' else B))
terz('FD-B1', 'square', 1.5, 1.0, 0.0, 30, 18.0, 3)
terz('FD-B2', 'strip', 1.2, 1.0, 20.0, 25, 17.5, 3)
terz('FD-B3', 'square', 2.0, 1.5, 60.0, 0, 18.0, 3)
def general(tag, B, L, Df, c, ph, g, FS, q=None, g_eff=None, beta=0.0):
    p = radians(ph); Nq = tan(radians(45)+p/2)**2*exp(pi*tan(p)); Nc = (Nq-1)/tan(p) if ph > 0 else 5.14; Ng = 2*(Nq+1)*tan(p)
    q = g*Df if q is None else q; ge = g if g_eff is None else g_eff
    Fcs = 1 + (B/L)*(Nq/Nc); Fqs = 1 + (B/L)*tan(p); Fgs = 1 - 0.4*B/L
    r = Df/B if Df/B <= 1 else atan(Df/B)
    if ph > 0:
        Fqd = 1 + 2*tan(p)*(1-sin(p))**2*r; Fcd = Fqd - (1-Fqd)/(Nc*tan(p))
    else:
        Fqd = 1.0; Fcd = 1 + 0.4*r
    Fgd = 1.0
    Fci = Fqi = (1-beta/90)**2; Fgi = (1-beta/ph)**2 if ph > 0 else 1.0
    qu = c*Nc*Fcs*Fcd*Fci + q*Nq*Fqs*Fqd*Fqi + 0.5*ge*B*Ng*Fgs*Fgd*Fgi
    P(tag, Nc=Nc, Nq=Nq, Ngamma=Ng, Fcs=Fcs, Fqs=Fqs, Fgs=Fgs, Fcd=Fcd, Fqd=Fqd, q=q, gamma_used=ge, qu=qu, qall=qu/FS)
general('FD-B4', 1.5, 1.5, 1.0, 0.0, 30, 18.0, 3)
general('FD-B5', 2.0, 3.0, 1.5, 15.0, 28, 17.0, 3)
# water table case II: d below base = 0.5 m, B = 1.5, gamma 18, gamma_sat 20 -> gamma' = 10.19
gp = 20 - 9.81; gbar = gp + (0.5/1.5)*(18-gp)
general('FD-B6', 1.5, 1.5, 1.0, 0.0, 30, 18.0, 3, g_eff=gbar)
# water table case I: WT at 0.6 m below ground, Df = 1.0
q1 = 0.6*18 + 0.4*gp
general('FD-B7', 1.5, 1.5, 1.0, 0.0, 30, 18.0, 3, q=q1, g_eff=gp)

# ---------- FD-I1 isolated square footing design
def isolated(tag, PD, PL, col, qa, fc, fy, h, db, Df, gc=24.0, gs=18.0, B=None):
    Ps = PD+PL; qe = qa - gc*h/1e3 - gs*(Df - h/1e3)
    Areq = Ps/qe; Bcalc = sqrt(Areq); B = B or (int(Bcalc/0.1)+1)*0.1
    Pu = 1.2*PD + 1.6*PL; qu = Pu/(B*B)
    d = h - 75 - db   # average d for two layers: cover 75 + one bar diameter
    # one-way
    Lv = (B*1e3 - col)/2 - d; Vu1 = qu*B*Lv/1e3; Vc1 = 0.75*0.17*sqrt(fc)*B*1e3*d/1e3
    # two-way
    bo = 4*(col+d); Vu2 = qu*(B*B - ((col+d)/1e3)**2)
    vc = min(0.33, 0.17*(1+2/1.0), 0.083*(2 + 40*d/bo))*sqrt(fc); Vc2 = 0.75*vc*bo*d/1e3
    # flexure at column face
    Lm = (B*1e3 - col)/2/1e3; Mu = qu*B*Lm**2/2
    b = B*1e3; Rn = Mu*1e6/(0.9*b*d*d); m = fy/(0.85*fc); rho = (1/m)*(1-sqrt(1-2*m*Rn/fy)); As = rho*b*d
    rmin = 0.0020 if fy < 420 else max(0.0018*420/fy, 0.0014); Asmin = rmin*b*h; Asu = max(As, Asmin)
    nb = int(Asu/(pi*db*db/4)) + 1
    P(tag, q_net_allow=qe, A_req=Areq, B_calc=Bcalc, B_use=B, Pu=Pu, qu=qu, d=d, Vu_oneway=Vu1, phiVc_oneway=Vc1, DC1=Vu1/Vc1, bo=bo, Vu_punch=Vu2, vc_MPa=vc, phiVc_punch=Vc2, DC2=Vu2/Vc2, Mu=Mu, Rn=Rn, As_req=As, As_min=Asmin, As_use=Asu, bars=nb)
isolated('FD-I1', 800, 600, 400, 200, 21, 420, 550, 20, 1.5)
isolated('FD-I2', 500, 350, 350, 150, 28, 280, 450, 16, 1.2)

# ---------- FD-W1 wall footing per metre
def wallfoot(tag, wD, wL, tw, qa, fc, fy, h, db, Df, gc=24.0, gs=18.0):
    qe = qa - gc*h/1e3 - gs*(Df-h/1e3); Bc = (wD+wL)/qe; B = (int(Bc/0.1)+1)*0.1
    wu = 1.2*wD + 1.6*wL; qu = wu/B; d = h - 75 - db/2
    Vu = qu*((B*1e3 - tw)/2 - d)/1e3; Vc = 0.75*0.17*sqrt(fc)*1000*d/1e3
    Lm = (B*1e3 - tw)/2/1e3; Mu = qu*Lm**2/2   # concrete wall: critical section at face of wall
    Rn = Mu*1e6/(0.9*1000*d*d); m = fy/(0.85*fc); rho = (1/m)*(1-sqrt(1-2*m*Rn/fy)); As = rho*1000*d
    rmin = 0.0020 if fy < 420 else max(0.0018*420/fy, 0.0014); Asmin = rmin*1000*h
    P(tag, q_net_allow=qe, B_calc=Bc, B_use=B, wu=wu, qu=qu, d=d, Vu=Vu, phiVc=Vc, DC_shear=Vu/Vc, Mu=Mu, As_req=As, As_min=Asmin, s_for_bar=pi*db*db/4*1000/max(As, Asmin))
wallfoot('FD-W1', 180, 120, 300, 190, 21, 420, 350, 16, 1.2)

# ---------- SH-C1 load combinations (NSCP 203.3.1), effects: D=100, L=60, Lr=20, W=40, E=50, f1=0.5
D, L, Lr, W, E, f1 = 100.0, 60.0, 20.0, 40.0, 50.0, 0.5
c = {'203-1': 1.4*D, '203-2': 1.2*D + 1.6*L + 0.5*Lr, '203-3a': 1.2*D + 1.6*Lr + f1*L, '203-3b': 1.2*D + 1.6*Lr + 0.5*W,
     '203-4': 1.2*D + 1.0*W + f1*L + 0.5*Lr, '203-5': 1.2*D + 1.0*E + f1*L, '203-6': 0.9*D + 1.0*W, '203-7': 0.9*D + 1.0*E}
P('SH-C1 strength', **c)
a = {'203-8': D, '203-9': D + L, '203-10': D + Lr, '203-11': D + 0.75*(L + Lr), '203-12a': D + 0.6*W, '203-12b': D + E/1.4,
     '203-13a': D + 0.75*(L + Lr + 0.6*W), '203-13b': D + 0.75*(L + Lr + E/1.4),
     '203-13a(-W)': D + 0.75*(L + Lr - 0.6*W), '203-13b(-E)': D + 0.75*(L + Lr - E/1.4)}
P('SH-C1 allowable', **a)

# ---------- SH-L1 load transfer: panel S = 4 m (short), Lg = 6 m (long), w = 1.2D+1.6L, D = 4.8 kPa, L = 2.4 kPa
S, Lg = 4.0, 6.0; wD, wL = 4.8, 2.4; w = 1.2*wD + 1.6*wL; mr = S/Lg
P('SH-L1', ratio_long_short=Lg/S, action='two-way' if Lg/S < 2 else 'one-way', wu_kPa=w, tri_peak_on_short_beam=w*S/2, trap_peak_on_long_beam=w*S/2,
  equiv_udl_short_moment=w*S/3, equiv_udl_long_moment=w*S/3*(3-mr*mr)/2, area_tri=S*S/4, area_trap=S*Lg/2 - S*S/4,
  total_on_short_beam=w*S*S/4, total_on_long_beam=w*(S*Lg/2 - S*S/4), check_sum=2*w*S*S/4 + 2*w*(S*Lg/2 - S*S/4), panel_total=w*S*Lg)
# one-way panel 3 m x 7.5 m
S, Lg = 3.0, 7.5
P('SH-L2', ratio=Lg/S, action='one-way', line_load_on_each_long_beam=w*S/2, column_tributary_example_kN=w*6.0*7.5)
